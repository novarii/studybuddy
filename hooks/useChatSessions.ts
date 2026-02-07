"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { ChatSession } from "@/types";

export const useChatSessions = (courseId: string | undefined) => {
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track newly created sessions that don't exist in backend yet
  const newSessionIds = useRef<Set<string>>(new Set());

  // Track current courseId so async fetches can detect staleness
  const courseIdRef = useRef(courseId);
  courseIdRef.current = courseId;

  // Fetch sessions for the current course
  const fetchSessions = useCallback(async () => {
    if (!courseId) {
      setSessions([]);
      return;
    }

    setSessions([]);
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await api.sessions.list(token, courseId);
      // Discard result if courseId changed during the fetch
      if (courseIdRef.current !== courseId) return;
      setSessions(response.sessions);
    } catch (err) {
      if (courseIdRef.current !== courseId) return;
      setError(err instanceof Error ? err : new Error("Failed to fetch sessions"));
    } finally {
      if (courseIdRef.current === courseId) {
        setIsLoading(false);
      }
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

      // Track as new session (doesn't exist in Agno yet until first message)
      newSessionIds.current.add(response.session_id);

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

  // Check if a session was just created (doesn't exist in backend yet)
  const isNewSession = useCallback((sessionId: string): boolean => {
    return newSessionIds.current.has(sessionId);
  }, []);

  // Mark a session as no longer new (after first message sent)
  const markSessionCreated = useCallback((sessionId: string): void => {
    newSessionIds.current.delete(sessionId);
  }, []);

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
    } catch {
      // Silently fail for title generation - it's not critical
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
    isNewSession,
    markSessionCreated,
    refetch: fetchSessions,
  };
};
