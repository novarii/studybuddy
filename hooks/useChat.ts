"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useChat as useAIChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { ChatMessage, RAGSource } from "@/types";

export const useChat = (
  courseId: string | undefined,
  sessionId: string | undefined,
  options?: {
    isNewSession?: (sessionId: string) => boolean;
    onSessionCreated?: (sessionId: string) => void;
  }
) => {
  const { getToken } = useAuth();
  const [streamingSources, setStreamingSources] = useState<RAGSource[]>([]);
  const [sourcesMap, setSourcesMap] = useState<Record<string, RAGSource[]>>({});
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Cache getToken in ref to prevent dependency array issues
  // Clerk's getToken reference may change on every render, causing unnecessary re-runs
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Token cache to prevent repeated Clerk calls
  const tokenCacheRef = useRef<{ token: string | null; expires: number }>({
    token: null,
    expires: 0
  });

  const getCachedToken = useCallback(async () => {
    const now = Date.now();
    if (tokenCacheRef.current.token && now < tokenCacheRef.current.expires) {
      return tokenCacheRef.current.token;
    }
    const token = await getTokenRef.current();
    tokenCacheRef.current = { token, expires: now + 55000 }; // Cache for 55 seconds
    return token;
  }, []);

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
        const token = await getCachedToken();
        if (!token) return;

        const messages = await api.sessions.getMessages(token, sessionId);

        // Convert to UIMessage format
        const uiMessages: UIMessage[] = messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          parts: [{ type: "text" as const, text: msg.content }],
        }));

        // Build sources map from loaded messages
        const loadedSourcesMap: Record<string, RAGSource[]> = {};
        for (const msg of messages) {
          if (msg.sources && msg.sources.length > 0) {
            loadedSourcesMap[msg.id] = msg.sources;
          }
        }
        setSourcesMap(loadedSourcesMap);

        setInitialMessages(uiMessages);
      } catch (err) {
        console.error("Failed to load chat history:", err);
        setInitialMessages([]);
        setSourcesMap({});
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId, getCachedToken]);

  // Memoize transport - uses ref for sessionId to always get current value
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    // Transform the request to match the local API route's expected format
    prepareSendMessagesRequest: ({ messages }) => {
      return {
        body: {
          messages,
          sessionId: sessionIdRef.current,
          courseId,
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
    // Throttle UI updates to prevent render on every token (default behavior)
    // This significantly reduces CPU usage during streaming
    experimental_throttle: 50,
    onData: (dataPart) => {
      // Capture RAG sources from data-rag-source stream events
      // Backend sends: { type: "data-rag-source", data: { source_id, source_type, ... } }
      if (dataPart.type === "data-rag-source") {
        const sourceData = (dataPart as { type: string; data: RAGSource }).data;
        setStreamingSources((prev) => [...prev, sourceData]);
      }
    },
    onFinish: ({ message }) => {
      // Persist streaming sources to sourcesMap for this message
      setStreamingSources((currentSources) => {
        if (currentSources.length > 0) {
          setSourcesMap((prev) => ({
            ...prev,
            [message.id]: currentSources,
          }));
        }
        return []; // Clear streaming sources
      });

      // Fallback: Extract RAG sources from message metadata if available
      const metadata = message.metadata as { sources?: RAGSource[] } | undefined;
      if (metadata?.sources && metadata.sources.length > 0) {
        setSourcesMap((prev) => ({
          ...prev,
          [message.id]: metadata.sources!,
        }));
      }
    },
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  // Sync loaded messages to AI SDK state when initialMessages changes
  // This handles both loading history and clearing when switching sessions
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  // Convert AI SDK messages to our format - memoized to prevent unnecessary re-renders
  const messages: ChatMessage[] = useMemo(() => {
    const start = performance.now();
    const result = aiMessages.map((msg, index) => {
      // Extract text content from parts
      const textContent = msg.parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");

      const isLastAssistantMessage = msg.role === "assistant" && index === aiMessages.length - 1;
      const isCurrentlyStreaming = status === "streaming" && isLastAssistantMessage;

      // Get sources: use streaming sources for active stream, otherwise use sourcesMap
      let messageSources: RAGSource[] | undefined;
      if (msg.role === "assistant") {
        if (isCurrentlyStreaming) {
          messageSources = streamingSources.length > 0 ? streamingSources : undefined;
        } else {
          messageSources = sourcesMap[msg.id];
        }
      }

      return {
        id: msg.id,
        role: msg.role as "user" | "assistant",
        content: textContent,
        timestamp: new Date(), // UIMessage doesn't have createdAt in v5
        isStreaming: isCurrentlyStreaming,
        sources: messageSources,
      };
    });
    const duration = performance.now() - start;
    if (duration > 10) {
      console.warn(`[SLOW] messages mapping: ${duration.toFixed(1)}ms for ${aiMessages.length} messages`);
    }
    return result;
  }, [aiMessages, status, streamingSources, sourcesMap]);

  const isLoading = status === "streaming" || status === "submitted";

  // sendMessage accepts message text and optional sessionId override
  const sendMessage = useCallback(async (messageText: string, overrideSessionId?: string) => {
    const message = messageText.trim();
    if (!message || !courseId || isLoading) return;

    // Use override if provided (for newly created sessions)
    const effectiveSessionId = overrideSessionId || sessionIdRef.current;
    if (overrideSessionId) {
      sessionIdRef.current = overrideSessionId;
    }

    // Get cached token (fresh tokens cause performance issues)
    const token = await getCachedToken();

    setStreamingSources([]);

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
  }, [courseId, isLoading, aiSendMessage, getCachedToken]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setInitialMessages([]);
    setSourcesMap({});
    setStreamingSources([]);
  }, [setMessages]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deleteCourseHistory = useCallback((deletedCourseId: string) => {
    // Note: AI SDK v5 manages its own history per id
    // This is now handled by changing the id prop
  }, []);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    clearMessages,
    deleteCourseHistory,
    stop,
    sources: streamingSources,
    error,
  };
};
