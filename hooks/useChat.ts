"use client";

import { useState, useCallback, useMemo } from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAuth } from "@clerk/nextjs";
import type { ChatMessage, RAGSource } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const useChat = (courseId: string | undefined) => {
  const { getToken } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [sources, setSources] = useState<RAGSource[]>([]);

  // Memoize transport - headers will be passed at request level for fresh tokens
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
  } = useAIChat({
    id: courseId, // Per-course conversation
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

  const sendMessage = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || !courseId || isLoading) return;

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
  }, [inputValue, courseId, isLoading, aiSendMessage, getToken]);

  const clearMessages = useCallback(() => {
    // Note: AI SDK v5 doesn't have a built-in clear method
    // For now, this is a no-op - we'd need to manage state differently for this
  }, []);

  const deleteCourseHistory = useCallback((_deletedCourseId: string) => {
    // Note: AI SDK v5 manages its own history per id
    // This is now handled by changing the id prop
  }, []);

  return {
    messages,
    isLoading,
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
