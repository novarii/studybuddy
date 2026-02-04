-- Migration: Create slide_chunks_knowledge table for RAG vector storage
-- This table stores document chunks with embeddings for similarity search

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the slide_chunks_knowledge table in ai schema
CREATE TABLE IF NOT EXISTS ai.slide_chunks_knowledge (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  meta_data JSONB NOT NULL,
  embedding vector(1536) NOT NULL  -- OpenAI-compatible embedding dimension
);

-- Index for vector similarity search using cosine distance
-- ivfflat index for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_slide_chunks_embedding
ON ai.slide_chunks_knowledge
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index on metadata for filtering by course/document
CREATE INDEX IF NOT EXISTS idx_slide_chunks_meta_course
ON ai.slide_chunks_knowledge ((meta_data->>'course_id'));

CREATE INDEX IF NOT EXISTS idx_slide_chunks_meta_document
ON ai.slide_chunks_knowledge ((meta_data->>'document_id'));

CREATE INDEX IF NOT EXISTS idx_slide_chunks_meta_owner
ON ai.slide_chunks_knowledge ((meta_data->>'owner_id'));
