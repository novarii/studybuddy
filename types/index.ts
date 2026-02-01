// RAG source from backend chat streaming
export type RAGSource = {
  source_id: string;
  source_type: "slide" | "lecture";
  content_preview: string;
  chunk_number: number; // Citation number [1], [2], etc.
  document_id?: string;
  slide_number?: number;
  lecture_id?: string;
  start_seconds?: number;
  end_seconds?: number;
  course_id?: string;
  title?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: RAGSource[];
};

export type MaterialType = "pdf" | "video";

export type Material = {
  id: string;
  name: string;
  file: File;
  courseId: string;
  type: MaterialType;
};

// Matches backend CourseResponse schema
export type Course = {
  id: string;
  code: string;
  title: string;
  instructor: string | null;
};

// Document from backend
export type Document = {
  id: string;
  course_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: "uploaded" | "failed";
  created_at: string;
  updated_at: string;
};

// Lecture from backend
export type Lecture = {
  id: string;
  course_id: string;
  panopto_session_id: string | null;
  panopto_url: string;
  stream_url: string;
  title: string | null;
  duration_seconds: number | null;
  status: "pending" | "downloading" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ColorScheme = {
  background: string;
  panel: string;
  card: string;
  border: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  accentHover: string;
  hover: string;
  selected: string;
  buttonIcon: string;
};

// Chat session from backend
export type ChatSession = {
  session_id: string;
  session_name: string | null;
  course_id: string | null;
  created_at: string;
  updated_at: string;
};

// Message from backend (for loading history)
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};
