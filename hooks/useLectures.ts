"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { Lecture } from "@/types";

export const useLectures = (courseId: string) => {
  const { getToken } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLectures = useCallback(async () => {
    if (!courseId) {
      setLectures([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      const lecs = await api.lectures.listByCourse(token, courseId);
      setLectures(lecs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch lectures");
      setLectures([]);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, getToken]);

  // Fetch lectures when courseId changes
  useEffect(() => {
    fetchLectures();
  }, [fetchLectures]);

  return {
    lectures,
    isLoading,
    error,
    refetch: fetchLectures,
  };
};
