"use client";

import { useState } from "react";
import type { RAGSource } from "@/types";

interface CitationLinkProps {
  index: number;
  source: RAGSource;
  onClick: () => void;
  accentColor: string;
}

function formatTime(seconds?: number): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function CitationLink({ index, source, onClick, accentColor }: CitationLinkProps) {
  const [isHovered, setIsHovered] = useState(false);

  const title =
    source.source_type === "slide"
      ? `${source.title || "Document"} - Slide ${source.slide_number}`
      : `${source.title || "Lecture"} @ ${formatTime(source.start_seconds)}`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="inline-flex items-center justify-center px-1 py-0.5 mx-0.5
                 text-xs font-medium rounded transition-colors cursor-pointer
                 align-baseline"
      style={{
        backgroundColor: isHovered ? `${accentColor}` : `${accentColor}30`,
        color: isHovered ? "white" : accentColor,
      }}
      title={title}
    >
      [{index}]
    </button>
  );
}
