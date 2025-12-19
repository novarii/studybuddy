"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/types";

const generateId = () => Math.random().toString(36).substring(2, 9);

// Mock responses for development - will be replaced with actual API calls
const mockResponses = [
  "That's an interesting question! Based on the course materials, the key concepts to understand are the fundamental principles and how they apply to real-world scenarios.",
  "Great question! Let me break this down for you. The topic you're asking about involves several interconnected concepts that build upon each other.",
  "I'd be happy to help explain this. The main idea here relates to how these concepts work together to form a comprehensive understanding of the subject matter.",
  "Based on what we've covered, this topic is central to understanding the broader themes of the course. Let me elaborate on the key points.",
];

const getRandomMockResponse = () => {
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
};

export const useChat = (courseId: string | undefined) => {
  const [allChatHistories, setAllChatHistories] = useState<Map<string, ChatMessage[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const messages = courseId ? allChatHistories.get(courseId) || [] : [];

  useEffect(() => {
    if (courseId && !allChatHistories.has(courseId)) {
      setAllChatHistories(prev => new Map(prev).set(courseId, []));
    }
  }, [courseId, allChatHistories]);

  const sendMessage = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || !courseId) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setInputValue("");

    setAllChatHistories(prevAllChatHistories => {
      const newAllChatHistories = new Map(prevAllChatHistories);
      const currentMessages = newAllChatHistories.get(courseId) || [];
      newAllChatHistories.set(courseId, [...currentMessages, userMessage]);
      return newAllChatHistories;
    });

    setIsLoading(true);

    const assistantPlaceholderId = generateId();
    setAllChatHistories(prevAllChatHistories => {
      const newAllChatHistories = new Map(prevAllChatHistories);
      const currentMessages = newAllChatHistories.get(courseId) || [];
      newAllChatHistories.set(courseId, [
        ...currentMessages,
        {
          id: assistantPlaceholderId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isTyping: true,
        },
      ]);
      return newAllChatHistories;
    });

    const delay = 1000 + Math.random() * 1000;

    setTimeout(() => {
      const fullResponse = getRandomMockResponse();

      setAllChatHistories(prevAllChatHistories => {
        const newAllChatHistories = new Map(prevAllChatHistories);
        const currentMessages = newAllChatHistories.get(courseId) || [];
        newAllChatHistories.set(
          courseId,
          currentMessages.map(msg =>
            msg.id === assistantPlaceholderId
              ? { ...msg, content: fullResponse, isTyping: false }
              : msg
          )
        );
        return newAllChatHistories;
      });
      setIsLoading(false);
    }, delay);
  }, [inputValue, courseId]);

  const clearMessages = useCallback(() => {
    if (courseId) {
      setAllChatHistories(prev => new Map(prev).set(courseId, []));
    }
  }, [courseId]);

  const deleteCourseHistory = useCallback((deletedCourseId: string) => {
    setAllChatHistories(prev => {
      const newMap = new Map(prev);
      newMap.delete(deletedCourseId);
      return newMap;
    });
  }, []);

  return {
    messages,
    isLoading,
    inputValue,
    setInputValue,
    sendMessage,
    clearMessages,
    deleteCourseHistory,
  };
};
