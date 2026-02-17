"use client";

import React, { memo } from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import type { ColorScheme, ChatMessage, RAGSource } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  colors: ColorScheme;
  onCitationClick?: (source: RAGSource) => void;
}

/**
 * Memoized message bubble component.
 * Only re-renders when message content, streaming state, or sources change.
 * This prevents the entire message list from re-rendering on every streaming token.
 */
export const MessageBubble = memo(
  function MessageBubble({ message, colors, onCitationClick }: MessageBubbleProps) {
    if (message.role === "user") {
      return (
        <div className="flex justify-end">
          <div
            className="max-w-[80%] rounded-lg p-3 rounded-br-none"
            style={{
              backgroundColor: colors.accent,
              color: colors.buttonIcon,
            }}
          >
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            <span className="text-xs opacity-70 mt-1 block">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      );
    }

    // Assistant message
    return (
      <div>
        <div
          className="min-w-0 p-3"
          style={{
            color: colors.primaryText,
          }}
        >
          <div className="text-sm">
            {message.isStreaming && !message.content ? (
              <span className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: colors.accent, animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: colors.accent, animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: colors.accent, animationDelay: "300ms" }}
                  />
                </span>
                <span className="text-sm">Thinking...</span>
              </span>
            ) : (
              <>
                <MarkdownMessage
                  content={message.content}
                  isStreaming={message.isStreaming ?? false}
                  sources={message.sources}
                  onCitationClick={onCitationClick}
                  accentColor={colors.accent}
                />
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                )}
              </>
            )}
          </div>
          <span className="text-xs opacity-70 mt-1 block">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    );
  },
  // Custom comparison: only re-render if these values change
  (prevProps, nextProps) => {
    const prev = prevProps.message;
    const next = nextProps.message;

    // Always re-render if streaming state changes
    if (prev.isStreaming !== next.isStreaming) return false;

    // For streaming messages, re-render on content change
    if (next.isStreaming) {
      return prev.content === next.content && prev.sources?.length === next.sources?.length;
    }

    // For non-streaming messages, only re-render if content/sources actually changed
    return (
      prev.id === next.id &&
      prev.content === next.content &&
      prev.sources?.length === next.sources?.length &&
      prevProps.colors.accent === nextProps.colors.accent
    );
  }
);
