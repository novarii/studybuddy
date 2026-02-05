import type { Course, Document, Lecture, ChatSession, StoredMessage, RAGSource } from "@/types";

type FetchOptions = RequestInit & {
  token?: string;
};

/**
 * Fetch helper for local API routes
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

/**
 * Upload with progress tracking via XHR
 */
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
          reject(new Error(error.detail || error.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", endpoint);
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
     * List all documents for a course (uses local API route)
     */
    listByCourse: async (token: string, courseId: string): Promise<Document[]> => {
      const response = await fetchLocal<{ documents: Array<{
        id: string;
        filename: string;
        status: string;
        pageCount: number;
        uniquePageCount: number | null;
        createdAt: string;
      }> }>(`/api/documents?courseId=${courseId}`, { token });

      return response.documents.map((doc): Document => ({
        id: doc.id,
        filename: doc.filename,
        status: doc.status as Document['status'],
        page_count: doc.pageCount,
        unique_page_count: doc.uniquePageCount,
        created_at: doc.createdAt,
      }));
    },

    /**
     * Upload a PDF document to a course (uses local API route)
     */
    upload: (
      token: string,
      courseId: string,
      file: File,
      onProgress?: UploadProgressCallback
    ) => {
      const formData = new FormData();
      formData.append("courseId", courseId);
      formData.append("file", file);
      return uploadWithProgress("/api/documents", formData, token, onProgress);
    },

    /**
     * Delete a document (uses local API route)
     */
    delete: (token: string, documentId: string) =>
      fetchLocal<void>(`/api/documents/${documentId}`, { token, method: "DELETE" }),
  },

  lectures: {
    /**
     * List all lectures for a course (uses local API route)
     */
    listByCourse: async (token: string, courseId: string): Promise<Lecture[]> => {
      const response = await fetchLocal<{ lectures: Array<{
        id: string;
        courseId: string;
        panoptoSessionId: string | null;
        panoptoUrl: string;
        title: string | null;
        durationSeconds: number | null;
        chunkCount: number | null;
        status: string;
        errorMessage: string | null;
        createdAt: string;
        updatedAt: string;
      }> }>(`/api/lectures?courseId=${courseId}`, { token });

      return response.lectures.map((lecture): Lecture => ({
        id: lecture.id,
        course_id: lecture.courseId,
        panopto_session_id: lecture.panoptoSessionId,
        panopto_url: lecture.panoptoUrl || '',
        stream_url: '',
        title: lecture.title,
        duration_seconds: lecture.durationSeconds,
        status: lecture.status as Lecture['status'],
        error_message: lecture.errorMessage,
        created_at: lecture.createdAt,
        updated_at: lecture.updatedAt,
      }));
    },

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
