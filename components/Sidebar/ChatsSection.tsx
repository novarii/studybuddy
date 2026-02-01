"use client";

import React from "react";
import { PlusIcon, TrashIcon, MessageSquareIcon, LoaderIcon } from "lucide-react";
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

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
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
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header with New Chat button */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: colors.border }}>
        <span className="text-sm font-medium" style={{ color: colors.primaryText }}>
          Chats
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewChat}
          title="New chat"
          style={{ color: colors.primaryText }}
        >
          <PlusIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-4" style={{ color: colors.secondaryText }}>
            <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-sm" style={{ color: colors.secondaryText }}>
            No conversations yet.
            <br />
            Start a new chat!
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                className="group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  backgroundColor:
                    currentSessionId === session.session_id
                      ? colors.selected
                      : "transparent",
                }}
                onClick={() => onSelectSession(session.session_id)}
                onMouseEnter={(e) => {
                  if (currentSessionId !== session.session_id) {
                    e.currentTarget.style.backgroundColor = colors.hover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentSessionId !== session.session_id) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
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
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.session_id);
                  }}
                  title="Delete chat"
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
