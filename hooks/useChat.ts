"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useChat as useAIChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { ChatMessage, RAGSource } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const useChat = (
  courseId: string | undefined,
  sessionId: string | undefined,
  options?: {
    isNewSession?: (sessionId: string) => boolean;
    onSessionCreated?: (sessionId: string) => void;
  }
) => {
  const { getToken } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [sources, setSources] = useState<RAGSource[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Ref to track the current sessionId for sendMessage
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Refs for options callbacks to avoid infinite loops
  const isNewSessionRef = useRef(options?.isNewSession);
  const onSessionCreatedRef = useRef(options?.onSessionCreated);
  useEffect(() => {
    isNewSessionRef.current = options?.isNewSession;
    onSessionCreatedRef.current = options?.onSessionCreated;
  }, [options?.isNewSession, options?.onSessionCreated]);

  // Load messages when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setInitialMessages([]);
      return;
    }

    // Skip loading messages for newly created sessions (they don't exist in backend yet)
    if (isNewSessionRef.current?.(sessionId)) {
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
          parts: [{ type: "text" as const, text: msg.content }],
        }));

        setInitialMessages(uiMessages);
      } catch (err) {
        console.error("Failed to load chat history:", err);
        setInitialMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId, getToken]);

  // Memoize transport - uses ref for sessionId to always get current value
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${API_BASE}/agent/chat`,
    // Transform the request to match backend's expected format
    prepareSendMessagesRequest: ({ messages }) => {
      // Get the last user message text
      const lastMessage = messages[messages.length - 1];
      const messageText = lastMessage?.parts
        ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("") || "";

      return {
        body: {
          message: messageText,
          course_id: courseId,
          session_id: sessionIdRef.current,
        },
      };
    },
  }), [courseId]);

  const {
    messages: aiMessages,
    sendMessage: aiSendMessage,
    status,
    stop,
    error,
    setMessages,
  } = useAIChat({
    id: sessionId || courseId, // Use sessionId as conversation ID
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      // Extract RAG sources from message metadata if available
      const metadata = message.metadata as { sources?: RAGSource[] } | undefined;
      if (metadata?.sources) {
        setSources(metadata.sources);
      }
    },
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  // Convert AI SDK messages to our format
  const messages: ChatMessage[] = aiMessages.map((msg) => {
    // Extract text content from parts
    const textContent = msg.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");

    return {
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: textContent,
      timestamp: new Date(), // UIMessage doesn't have createdAt in v5
      isStreaming: status === "streaming" && msg.role === "assistant" && msg === aiMessages[aiMessages.length - 1],
      sources: (msg.metadata as { sources?: RAGSource[] } | undefined)?.sources,
    };
  });

  const isLoading = status === "streaming" || status === "submitted";

  // sendMessage accepts optional sessionId override for race condition handling
  const sendMessage = useCallback(async (overrideSessionId?: string) => {
    const message = inputValue.trim();
    if (!message || !courseId || isLoading) return;

    // Use override if provided (for newly created sessions)
    const effectiveSessionId = overrideSessionId || sessionIdRef.current;
    if (overrideSessionId) {
      sessionIdRef.current = overrideSessionId;
    }

    // Get fresh token for each request (best practice per AI SDK docs)
    const token = await getToken();

    setInputValue("");
    setSources([]);

    await aiSendMessage(
      { text: message },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Mark session as created in backend after first message
    if (effectiveSessionId) {
      onSessionCreatedRef.current?.(effectiveSessionId);
    }
  }, [inputValue, courseId, isLoading, aiSendMessage, getToken]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setInitialMessages([]);
  }, [setMessages]);

  const deleteCourseHistory = useCallback((_deletedCourseId: string) => {
    // Note: AI SDK v5 manages its own history per id
    // This is now handled by changing the id prop
  }, []);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    inputValue,
    setInputValue,
    sendMessage,
    clearMessages,
    deleteCourseHistory,
    stop,
    sources,
    error,
  };
};
