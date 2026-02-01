# Chat Persistence - Frontend Implementation Plan

## Overview

Implement chat session persistence UI to allow users to:
- See list of chat sessions in sidebar
- Switch between chat sessions
- Create new chat sessions
- Continue conversations across page reloads
- Delete chat sessions

## Prerequisites

- Backend implementation complete (see `studybuddy-backend/.agent/Tasks/chat_persistence_backend.md`)
- Current chat streaming integration working (feature/chat-integration branch)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Components                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sidebar/                                                        │
│  ├── ChatsSection.tsx        # "Chats" accordion in sidebar     │
│  │   ├── SessionList         # List of sessions                 │
│  │   ├── SessionItem         # Individual session row           │
│  │   └── NewChatButton       # Create new session               │
│                                                                  │
│  hooks/                                                          │
│  ├── useChatSessions.ts      # List/create/delete sessions      │
│  └── useChat.ts              # Modified to accept session_id    │
│                                                                  │
│  lib/                                                            │
│  └── api.ts                  # Add session API methods          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. Add Session Types

**File:** `types/index.ts`

```typescript
// Chat session from backend
export type ChatSession = {
  session_id: string;
  session_name: string | null;
  course_id: string | null;
  created_at: string;
  updated_at: string;
};

// Message from backend (for loading history)
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};
```

### 2. Add Session API Methods

**File:** `lib/api.ts`

```typescript
export const api = {
  // ... existing methods ...

  sessions: {
    /**
     * List chat sessions for a course
     */
    list: (token: string, courseId?: string) =>
      fetchWithAuth<{ sessions: ChatSession[]; total: number }>(
        `/sessions${courseId ? `?course_id=${courseId}` : ""}`,
        { token }
      ),

    /**
     * Create a new chat session
     */
    create: (token: string, courseId: string) =>
      fetchWithAuth<{ session_id: string }>("/sessions", {
        token,
        method: "POST",
        body: JSON.stringify({ course_id: courseId }),
      }),

    /**
     * Get messages for a session
     */
    getMessages: (token: string, sessionId: string) =>
      fetchWithAuth<StoredMessage[]>(`/sessions/${sessionId}/messages`, {
        token,
      }),

    /**
     * Delete a session
     */
    delete: (token: string, sessionId: string) =>
      fetchWithAuth<void>(`/sessions/${sessionId}`, {
        token,
        method: "DELETE",
      }),

    /**
     * Generate title for a session
     */
    generateTitle: (token: string, sessionId: string) =>
      fetchWithAuth<{ session_name: string }>(
        `/sessions/${sessionId}/generate-title`,
        { token, method: "POST" }
      ),
  },
};
```

### 3. Create useChatSessions Hook

**File:** `hooks/useChatSessions.ts`

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { ChatSession } from "@/types";

export const useChatSessions = (courseId: string | undefined) => {
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch sessions for the current course
  const fetchSessions = useCallback(async () => {
    if (!courseId) return;

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await api.sessions.list(token, courseId);
      setSessions(response.sessions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch sessions"));
    } finally {
      setIsLoading(false);
    }
  }, [courseId, getToken]);

  // Fetch on mount and when courseId changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Create a new session
  const createSession = useCallback(async (): Promise<string | null> => {
    if (!courseId) return null;

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await api.sessions.create(token, courseId);

      // Add to local state
      const newSession: ChatSession = {
        session_id: response.session_id,
        session_name: null,
        course_id: courseId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);

      return response.session_id;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to create session"));
      return null;
    }
  }, [courseId, getToken]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      await api.sessions.delete(token, sessionId);

      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));

      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to delete session"));
      return false;
    }
  }, [getToken]);

  // Generate title for a session
  const generateTitle = useCallback(async (sessionId: string): Promise<string | null> => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await api.sessions.generateTitle(token, sessionId);

      // Update local state
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === sessionId
            ? { ...s, session_name: response.session_name }
            : s
        )
      );

      return response.session_name;
    } catch (err) {
      return null;
    }
  }, [getToken]);

  return {
    sessions,
    isLoading,
    error,
    createSession,
    deleteSession,
    generateTitle,
    refetch: fetchSessions,
  };
};
```

### 4. Update useChat Hook

**File:** `hooks/useChat.ts`

Modify to accept `sessionId` and load initial messages:

```typescript
export const useChat = (
  courseId: string | undefined,
  sessionId: string | undefined,  // NEW: session ID for persistence
) => {
  const { getToken } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [sources, setSources] = useState<RAGSource[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load messages when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setInitialMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsLoadingHistory(true);
      try {
        const token = await getToken();
        if (!token) return;

        const messages = await api.sessions.getMessages(token, sessionId);

        // Convert to UIMessage format
        const uiMessages: UIMessage[] = messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          parts: [{ type: "text", text: msg.content }],
        }));

        setInitialMessages(uiMessages);
      } catch (err) {
        console.error("Failed to load chat history:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId, getToken]);

  // Update transport to include session_id
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${API_BASE}/agent/chat`,
    prepareSendMessagesRequest: ({ messages }) => {
      const lastMessage = messages[messages.length - 1];
      const messageText = lastMessage?.parts
        ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("") || "";

      return {
        body: {
          message: messageText,
          course_id: courseId,
          session_id: sessionId,  // Include session_id
        },
      };
    },
  }), [courseId, sessionId]);

  const {
    messages: aiMessages,
    sendMessage: aiSendMessage,
    status,
    stop,
    error,
  } = useAIChat({
    id: sessionId || courseId,  // Use sessionId as conversation ID
    messages: initialMessages,   // Load initial messages
    transport,
    // ... rest of config
  });

  // ... rest of hook

  return {
    messages,
    isLoading,
    isLoadingHistory,  // NEW: loading state for history
    inputValue,
    setInputValue,
    sendMessage,
    // ... rest
  };
};
```

### 5. Create Chats Section Component

**File:** `components/Sidebar/ChatsSection.tsx`

```typescript
"use client";

import React from "react";
import { PlusIcon, TrashIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ColorScheme, ChatSession } from "@/types";

type ChatsSectionProps = {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  colors: ColorScheme;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
};

export const ChatsSection: React.FC<ChatsSectionProps> = ({
  sessions,
  currentSessionId,
  isLoading,
  colors,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with New Chat button */}
      <div className="flex items-center justify-between p-2">
        <span className="text-sm font-medium" style={{ color: colors.primaryText }}>
          Chats
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewChat}
          style={{ color: colors.primaryText }}
        >
          <PlusIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center" style={{ color: colors.secondaryText }}>
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-sm" style={{ color: colors.secondaryText }}>
            No conversations yet.
            <br />
            Start a new chat!
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                className={`
                  group flex items-center gap-2 p-2 rounded-lg cursor-pointer
                  transition-colors
                `}
                style={{
                  backgroundColor:
                    currentSessionId === session.session_id
                      ? colors.selected
                      : "transparent",
                }}
                onClick={() => onSelectSession(session.session_id)}
              >
                <MessageSquareIcon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: colors.secondaryText }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm truncate"
                    style={{ color: colors.primaryText }}
                  >
                    {session.session_name || "New conversation"}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: colors.secondaryText }}
                  >
                    {formatDate(session.updated_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.session_id);
                  }}
                  style={{ color: colors.secondaryText }}
                >
                  <TrashIcon className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
```

### 6. Update StudyBuddyClient

**File:** `components/StudyBuddyClient.tsx`

Integrate session management:

```typescript
// Add imports
import { useChatSessions } from "@/hooks/useChatSessions";

export const StudyBuddyClient = () => {
  // Existing state...
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Session management
  const {
    sessions,
    isLoading: isSessionsLoading,
    createSession,
    deleteSession,
    generateTitle,
  } = useChatSessions(currentCourseId);

  // Updated useChat with sessionId
  const {
    messages,
    isLoading: isChatLoading,
    isLoadingHistory,
    inputValue,
    setInputValue,
    sendMessage,
    error: chatError,
  } = useChat(currentCourseId, currentSessionId);

  // Auto-generate title after first response
  useEffect(() => {
    if (currentSessionId && messages.length === 2) {
      // 2 messages = 1 user + 1 assistant (first exchange complete)
      generateTitle(currentSessionId);
    }
  }, [currentSessionId, messages.length, generateTitle]);

  // Handlers
  const handleNewChat = async () => {
    const sessionId = await createSession();
    if (sessionId) {
      setCurrentSessionId(sessionId);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const success = await deleteSession(sessionId);
    if (success && currentSessionId === sessionId) {
      // Switch to another session or null
      const remaining = sessions.filter((s) => s.session_id !== sessionId);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].session_id : null);
    }
  };

  // When course changes, reset session
  useEffect(() => {
    setCurrentSessionId(null);
  }, [currentCourseId]);

  // Auto-select first session when sessions load
  useEffect(() => {
    if (!currentSessionId && sessions.length > 0) {
      setCurrentSessionId(sessions[0].session_id);
    }
  }, [sessions, currentSessionId]);

  // Modify sendMessage to create session if none exists
  const handleSendMessage = async () => {
    // If no session, create one first
    if (!currentSessionId) {
      const sessionId = await createSession();
      if (sessionId) {
        setCurrentSessionId(sessionId);
        // Wait for state update, then send
        // Or use a ref to track pending message
      }
    }
    sendMessage();
  };

  return (
    // ... update Sidebar to include ChatsSection
    <Sidebar
      // ... existing props
      sessions={sessions}
      currentSessionId={currentSessionId}
      isSessionsLoading={isSessionsLoading}
      onSelectSession={handleSelectSession}
      onNewChat={handleNewChat}
      onDeleteSession={handleDeleteSession}
    />
    // ...
  );
};
```

### 7. Update Sidebar Component

**File:** `components/Sidebar/Sidebar.tsx`

Add ChatsSection to the sidebar (it already has a "Chats" placeholder):

```typescript
import { ChatsSection } from "./ChatsSection";

// Add to props
type SidebarProps = {
  // ... existing props
  sessions: ChatSession[];
  currentSessionId: string | null;
  isSessionsLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
};

// In the component, replace the placeholder Chats section:
<ChatsSection
  sessions={sessions}
  currentSessionId={currentSessionId}
  isLoading={isSessionsLoading}
  colors={colors}
  onSelectSession={onSelectSession}
  onNewChat={onNewChat}
  onDeleteSession={onDeleteSession}
/>
```

---

## UI Flow

```
1. User selects a course
   └─► useChatSessions fetches sessions for that course
   └─► Most recent session auto-selected (or empty state)

2. User clicks "New Chat"
   └─► createSession() called
   └─► New session created, selected
   └─► Empty chat view shown

3. User sends first message
   └─► Message sent with session_id
   └─► Backend saves to Agno storage
   └─► After response, auto-generate title

4. User clicks different session
   └─► setCurrentSessionId(sessionId)
   └─► useChat loads messages from backend
   └─► Chat view shows history

5. User deletes session
   └─► Confirm dialog
   └─► deleteSession() called
   └─► Switch to next session or empty state
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `types/index.ts` | Modify | Add ChatSession, StoredMessage types |
| `lib/api.ts` | Modify | Add sessions API methods |
| `hooks/useChatSessions.ts` | Create | Session CRUD hook |
| `hooks/useChat.ts` | Modify | Add sessionId, load history |
| `components/Sidebar/ChatsSection.tsx` | Create | Sessions list UI |
| `components/Sidebar/Sidebar.tsx` | Modify | Integrate ChatsSection |
| `components/StudyBuddyClient.tsx` | Modify | Wire up session state |

---

## Testing Checklist

- [ ] Can create new session
- [ ] Can switch between sessions
- [ ] Messages persist after page reload
- [ ] Can delete session
- [ ] Sessions filtered by course
- [ ] Auto-generate title works
- [ ] Empty state shows when no sessions
- [ ] Loading states display correctly
- [ ] Error handling with toasts

---

## Future Enhancements

1. **Search sessions** - Filter sessions by content/title
2. **Session timestamps** - Group by "Today", "Yesterday", "Last week"
3. **Edit message** - Allow editing user messages (requires backend support)
4. **Export chat** - Download conversation as PDF/markdown
5. **Share session** - Generate shareable link
