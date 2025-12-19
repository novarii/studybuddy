import type { Course, Document } from "@/types";

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
    throw new Error(error.detail || `HTTP ${response.status}`);
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
     */
    listAll: (token: string) =>
      fetchWithAuth<Course[]>("/courses", { token }),

    /**
     * List courses the current user has added
     */
    listUserCourses: (token: string) =>
      fetchWithAuth<Course[]>("/user/courses", { token }),

    /**
     * Add a course to the current user's list
     */
    addToUser: (token: string, courseId: string) =>
      fetchWithAuth<{ message: string }>(`/user/courses/${courseId}`, {
        token,
        method: "POST",
      }),

    /**
     * Remove a course from the current user's list
     */
    removeFromUser: (token: string, courseId: string) =>
      fetchWithAuth<void>(`/user/courses/${courseId}`, {
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
};
