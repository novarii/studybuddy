"use client";

import React, { memo, useRef, useEffect, useCallback } from "react";
import { LoaderIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import type { ColorScheme, ChatMessage, RAGSource } from "@/types";

interface MessageListProps {
  messages: ChatMessage[];
  colors: ColorScheme;
  isLoadingHistory?: boolean;
  onCitationClick?: (source: RAGSource) => void;
}

/**
 * Memoized message list component.
 * Isolated from input state changes to prevent re-renders during typing.
 */
export const MessageList = memo(function MessageList({
  messages,
  colors,
  isLoadingHistory,
  onCitationClick,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  // Throttled scroll during streaming - only scroll every 100ms max
  // Instant scroll when new messages are added
  useEffect(() => {
    const messageCount = messages.length;
    const isStreaming = messages.some((m) => m.isStreaming);

    // New message added - scroll instantly
    if (messageCount > lastMessageCountRef.current) {
      lastMessageCountRef.current = messageCount;
      scrollToBottom(false);
      return;
    }

    // During streaming - throttle scroll updates
    if (isStreaming) {
      if (!scrollTimeoutRef.current) {
        scrollTimeoutRef.current = setTimeout(() => {
          scrollToBottom(false);
          scrollTimeoutRef.current = null;
        }, 100);
      }
    }

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [messages, scrollToBottom]);

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4 p-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12" style={{ color: colors.secondaryText }}>
            <LoaderIcon className="w-5 h-5 animate-spin mr-2" />
            <p className="text-sm">Loading conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12" style={{ color: colors.secondaryText }}>
            <p className="text-sm">Start a conversation by asking a question about your course materials</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                colors={colors}
                onCitationClick={onCitationClick}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </ScrollArea>
  );
});
