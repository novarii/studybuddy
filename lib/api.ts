import type { Course, Document, Lecture, ChatSession, StoredMessage, RAGSource } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type FetchOptions = RequestInit & {
  token?: string;
};

async function fetchWithAuth<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    ...(fetchOptions.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(fetchOptions.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || error.error || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Fetch helper for local API routes (no API_BASE prefix)
 */
async function fetchLocal<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    ...(fetchOptions.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  if (!(fetchOptions.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(endpoint, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || error.error || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export type DocumentUploadResponse = {
  document_id: string;
  course_id: string;
  status: string;
};

export type UploadProgressCallback = (progress: number) => void;

function uploadWithProgress(
  endpoint: string,
  formData: FormData,
  token: string,
  onProgress?: UploadProgressCallback
): Promise<DocumentUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `${API_BASE}${endpoint}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

export const api = {
  courses: {
    /**
     * List all available courses (official CDCS courses)
     * Uses local API route
     */
    listAll: async (token: string): Promise<Course[]> => {
      const response = await fetchLocal<{
        courses: Array<{
          id: string;
          code: string;
          title: string;
          instructor: string | null;
          isOfficial: boolean;
        }>;
      }>("/api/courses", { token });

      return response.courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        instructor: c.instructor,
      }));
    },

    /**
     * List courses the current user has added
     * Uses local API route
     */
    listUserCourses: async (token: string): Promise<Course[]> => {
      const response = await fetchLocal<{
        courses: Array<{
          id: string;
          code: string;
          title: string;
          instructor: string | null;
          isOfficial: boolean;
        }>;
      }>("/api/user/courses", { token });

      return response.courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        instructor: c.instructor,
      }));
    },

    /**
     * Add a course to the current user's list
     * Uses local API route
     */
    addToUser: (token: string, courseId: string) =>
      fetchLocal<{ message: string }>(`/api/user/courses/${courseId}`, {
        token,
        method: "POST",
      }),

    /**
     * Remove a course from the current user's list
     * Uses local API route
     */
    removeFromUser: (token: string, courseId: string) =>
      fetchLocal<void>(`/api/user/courses/${courseId}`, {
        token,
        method: "DELETE",
      }),
  },

  documents: {
    /**
     * List all documents for a course
     */
    listByCourse: (token: string, courseId: string) =>
      fetchWithAuth<Document[]>(`/courses/${courseId}/documents`, { token }),

    /**
     * Upload a PDF document to a course
     */
    upload: (
      token: string,
      courseId: string,
      file: File,
      onProgress?: UploadProgressCallback
    ) => {
      const formData = new FormData();
      formData.append("course_id", courseId);
      formData.append("file", file);
      return uploadWithProgress("/documents/upload", formData, token, onProgress);
    },

    /**
     * Get document details
     */
    get: (token: string, documentId: string) =>
      fetchWithAuth<Document>(`/documents/${documentId}`, { token }),

    /**
     * Delete a document
     */
    delete: (token: string, documentId: string) =>
      fetchWithAuth<void>(`/documents/${documentId}`, { token, method: "DELETE" }),
  },

  lectures: {
    /**
     * List all lectures for a course
     */
    listByCourse: (token: string, courseId: string) =>
      fetchWithAuth<Lecture[]>(`/courses/${courseId}/lectures`, { token }),

    /**
     * Get lecture details
     */
    get: (token: string, lectureId: string) =>
      fetchWithAuth<Lecture>(`/lectures/${lectureId}`, { token }),
  },

  sessions: {
    /**
     * List chat sessions for a course (uses local API route)
     */
    list: async (token: string, courseId?: string): Promise<{ sessions: ChatSession[]; total: number }> => {
      const response = await fetchLocal<{ sessions: Array<{
        id: string;
        courseId: string;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      }> }>(
        `/api/sessions${courseId ? `?courseId=${courseId}` : ""}`,
        { token }
      );

      // Transform camelCase response to snake_case for frontend compatibility
      return {
        sessions: response.sessions.map((s) => ({
          session_id: s.id,
          session_name: s.title,
          course_id: s.courseId,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        })),
        total: response.sessions.length,
      };
    },

    /**
     * Create a new chat session (uses local API route)
     */
    create: async (token: string, courseId: string): Promise<{ session_id: string }> => {
      const response = await fetchLocal<{
        id: string;
        courseId: string;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      }>("/api/sessions", {
        token,
        method: "POST",
        body: JSON.stringify({ courseId }),
      });

      return { session_id: response.id };
    },

    /**
     * Get messages for a session (uses local API route)
     */
    getMessages: async (token: string, sessionId: string): Promise<StoredMessage[]> => {
      const response = await fetchLocal<{
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          createdAt: string;
          sources?: Array<{
            sourceId: string;
            sourceType: "slide" | "lecture";
            chunkNumber: number;
            contentPreview: string;
            documentId?: string;
            slideNumber?: number;
            lectureId?: string;
            startSeconds?: number;
            endSeconds?: number;
            courseId?: string;
            title?: string;
          }>;
        }>;
      }>(`/api/sessions/${sessionId}/messages`, { token });

      // Transform camelCase response to snake_case for frontend compatibility
      return response.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.createdAt,
        sources: msg.sources?.map((src): RAGSource => ({
          source_id: src.sourceId,
          source_type: src.sourceType,
          chunk_number: src.chunkNumber,
          content_preview: src.contentPreview,
          document_id: src.documentId,
          slide_number: src.slideNumber,
          lecture_id: src.lectureId,
          start_seconds: src.startSeconds,
          end_seconds: src.endSeconds,
          course_id: src.courseId,
          title: src.title,
        })),
      }));
    },

    /**
     * Delete a session (uses local API route)
     */
    delete: (token: string, sessionId: string) =>
      fetchLocal<void>(`/api/sessions/${sessionId}`, {
        token,
        method: "DELETE",
      }),

    /**
     * Generate title for a session (uses local API route)
     */
    generateTitle: async (token: string, sessionId: string): Promise<{ session_name: string }> => {
      const response = await fetchLocal<{ title: string | null }>(
        `/api/sessions/${sessionId}/generate-title`,
        { token, method: "POST" }
      );

      return { session_name: response.title || "" };
    },
  },
};
