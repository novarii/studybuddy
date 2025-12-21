"use client";

import React, { useMemo } from "react";
import type { RAGSource } from "@/types";

type CitationTextProps = {
  content: string;
  sources?: RAGSource[];
  onCitationClick?: (source: RAGSource) => void;
  accentColor?: string;
};

/**
 * Renders text with clickable citation references like [1], [2], etc.
 * Citations are matched to RAG sources by chunk_number.
 */
export const CitationText: React.FC<CitationTextProps> = ({
  content,
  sources = [],
  onCitationClick,
  accentColor = "#3b82f6",
}) => {
  const parts = useMemo(() => {
    // Match citation patterns like [1], [2], [3], etc.
    const citationRegex = /\[(\d+)\]/g;
    const result: Array<{ type: "text" | "citation"; content: string; chunkNumber?: number }> = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(content)) !== null) {
      // Add text before the citation
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: content.slice(lastIndex, match.index),
        });
      }

      // Add the citation
      const chunkNumber = parseInt(match[1], 10);
      result.push({
        type: "citation",
        content: match[0],
        chunkNumber,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        type: "text",
        content: content.slice(lastIndex),
      });
    }

    return result;
  }, [content]);

  const handleCitationClick = (chunkNumber: number) => {
    const source = sources.find((s) => s.chunk_number === chunkNumber);
    if (source && onCitationClick) {
      onCitationClick(source);
    }
  };

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <span key={index}>{part.content}</span>;
        }

        const source = sources.find((s) => s.chunk_number === part.chunkNumber);
        const hasSource = !!source;

        return (
          <button
            key={index}
            onClick={() => part.chunkNumber && handleCitationClick(part.chunkNumber)}
            disabled={!hasSource}
            className={`
              inline-flex items-center justify-center
              px-1 py-0.5 mx-0.5
              text-xs font-medium
              rounded
              transition-colors
              ${hasSource
                ? "cursor-pointer hover:opacity-80"
                : "cursor-default opacity-60"
              }
            `}
            style={{
              backgroundColor: hasSource ? accentColor : undefined,
              color: hasSource ? "white" : "inherit",
              border: hasSource ? "none" : "1px solid currentColor",
            }}
            title={
              source
                ? source.source_type === "slide"
                  ? `${source.title || "Document"} - Slide ${source.slide_number}`
                  : `${source.title || "Lecture"} @ ${formatTime(source.start_seconds)}`
                : "Source not available"
            }
          >
            {part.content}
          </button>
        );
      })}
    </>
  );
};

function formatTime(seconds?: number): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
