"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";

export type UploadStatus = "pending" | "uploading" | "success" | "error";

export type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  documentId?: string;
};

export const useDocumentUpload = (courseId: string | undefined) => {
  const { getToken } = useAuth();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const updateUpload = (id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  };

  const uploadFile = useCallback(
    async (file: File) => {
      if (!courseId) return;

      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

      const id = generateId();
      const uploadItem: UploadItem = {
        id,
        file,
        status: "pending",
        progress: 0,
      };

      setUploads((prev) => [...prev, uploadItem]);

      // Client-side size validation
      if (file.size > MAX_FILE_SIZE) {
        updateUpload(id, {
          status: "error",
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
        });
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          updateUpload(id, { status: "error", error: "Not authenticated" });
          return;
        }

        updateUpload(id, { status: "uploading" });

        const result = await api.documents.upload(
          token,
          courseId,
          file,
          (progress) => updateUpload(id, { progress })
        );

        updateUpload(id, {
          status: "success",
          progress: 100,
          documentId: result.document_id,
        });
      } catch (err) {
        updateUpload(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [courseId, getToken]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.type === "application/pdf") {
          await uploadFile(file);
        }
      }
    },
    [uploadFile]
  );

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== "success"));
  }, []);

  // Counter tracks nested dragEnter/dragLeave from child elements
  // to prevent flickering. Increments on enter, decrements on leave.
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      uploadFiles(files);
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [uploadFiles]
  );

  const pendingUploads = uploads.filter((u) => u.status === "uploading" || u.status === "pending");
  const hasActiveUploads = pendingUploads.length > 0;

  return {
    uploads,
    isDragging,
    hasActiveUploads,
    uploadFile,
    uploadFiles,
    removeUpload,
    clearCompleted,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
  };
};
