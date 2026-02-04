-- Migration: Create lecture_chunks_knowledge table for lecture RAG vector storage
-- This table stores lecture transcript chunks with embeddings for similarity search

-- Ensure pgvector extension is enabled (should already exist from slide_chunks_knowledge)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the lecture_chunks_knowledge table in ai schema
CREATE TABLE IF NOT EXISTS ai.lecture_chunks_knowledge (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  meta_data JSONB NOT NULL,
  embedding vector(1536) NOT NULL  -- OpenAI-compatible embedding dimension
);

-- Index for vector similarity search using cosine distance
-- ivfflat index for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_lecture_chunks_embedding
ON ai.lecture_chunks_knowledge
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index on metadata for filtering by course
CREATE INDEX IF NOT EXISTS idx_lecture_chunks_meta_course
ON ai.lecture_chunks_knowledge ((meta_data->>'course_id'));

-- Index on metadata for filtering/deleting by lecture
CREATE INDEX IF NOT EXISTS idx_lecture_chunks_meta_lecture
ON ai.lecture_chunks_knowledge ((meta_data->>'lecture_id'));
