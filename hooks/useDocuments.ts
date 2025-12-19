"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { Document } from "@/types";

export const useDocuments = (courseId: string) => {
  const { getToken } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!courseId) {
      setDocuments([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      const docs = await api.documents.listByCourse(token, courseId);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch documents");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, getToken]);

  // Fetch documents when courseId changes
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }
      await api.documents.delete(token, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
      return false;
    }
  }, [getToken]);

  return {
    documents,
    isLoading,
    error,
    refetch: fetchDocuments,
    deleteDocument,
  };
};
