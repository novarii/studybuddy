"use client";

import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { createMathPlugin } from "@streamdown/math";
import "katex/dist/katex.min.css";
import { CitationLink } from "./CitationLink";
import { cn } from "@/lib/utils";
import type { RAGSource } from "@/types";

// Create math plugin with inline math support ($...$)
const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
});

interface MarkdownMessageProps {
  content: string;
  isStreaming: boolean;
  sources?: RAGSource[];
  onCitationClick?: (source: RAGSource) => void;
  accentColor: string;
  className?: string;
}

/**
 * Renders AI-generated markdown with citation support.
 * Citations like [1], [2] are converted to clickable buttons that reference RAG sources.
 */
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  isStreaming,
  sources = [],
  onCitationClick,
  accentColor,
  className,
}: MarkdownMessageProps) {
  // Preprocess content to convert citations [1] to markdown links [[1]](#cite-1)
  // Skip citations inside code blocks (backticks)
  const processedContent = useMemo(() => {
    return preprocessCitations(content);
  }, [content]);

  // Disable expensive features during streaming for better performance
  // They'll be enabled once streaming completes
  const enableSyntaxHighlighting = !isStreaming;

  return (
    <Streamdown
      mode="streaming"
      isAnimating={isStreaming}
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none overflow-x-auto break-words",
        // Override prose defaults to integrate with existing styling
        "prose-p:my-2 prose-p:leading-relaxed",
        "prose-headings:mt-4 prose-headings:mb-2",
        "prose-ul:my-2 prose-ol:my-2",
        "prose-li:my-0.5",
        "prose-pre:my-3 prose-pre:bg-muted",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
        "prose-a:text-primary prose-a:underline-offset-2",
        className
      )}
      shikiTheme={enableSyntaxHighlighting ? ["github-light", "github-dark"] : undefined}
      controls={{ code: enableSyntaxHighlighting, table: true, mermaid: false }}
      plugins={enableSyntaxHighlighting ? { math: mathPlugin } : {}}
      components={{
        // Custom link handler for citations [n]
        a: ({ href, children, ...props }) => {
          // Check if this is a citation link (href="#cite-N")
          const citeMatch = href?.match(/^#cite-(\d+)$/);
          if (citeMatch) {
            const chunkNumber = parseInt(citeMatch[1], 10);
            const source = sources.find((s) => s.chunk_number === chunkNumber);
            if (source) {
              return (
                <CitationLink
                  index={chunkNumber}
                  source={source}
                  onClick={() => onCitationClick?.(source)}
                  accentColor={accentColor}
                />
              );
            }
            // Citation without matching source - render as disabled
            return (
              <span
                className="inline-flex items-center justify-center px-1 py-0.5 mx-0.5
                           text-xs font-medium rounded opacity-60 cursor-default
                           border border-current"
                title="Source not available"
              >
                [{chunkNumber}]
              </span>
            );
          }
          // Regular link - open in new tab for external links
          const isExternal = href?.startsWith("http");
          return (
            <a
              href={href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              {...props}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {processedContent}
    </Streamdown>
  );
});

/**
 * Convert [1], [2] citations to markdown links for component override.
 * Preserves citations inside code blocks (backticks).
 */
function preprocessCitations(content: string): string {
  // Split by code blocks and inline code to avoid processing citations inside them
  const parts: string[] = [];

  // Match code blocks (```...```) and inline code (`...`)
  const codeRegex = /(```[\s\S]*?```|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(content)) !== null) {
    // Add text before code block (process citations)
    if (match.index > lastIndex) {
      parts.push(processCitationsInText(content.slice(lastIndex, match.index)));
    }
    // Add code block as-is (no citation processing)
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last code block
  if (lastIndex < content.length) {
    parts.push(processCitationsInText(content.slice(lastIndex)));
  }

  return parts.join("");
}

/**
 * Process citations in non-code text.
 */
function processCitationsInText(text: string): string {
  // Convert [1], [2], etc. to [[1]](#cite-1) markdown links
  return text.replace(/\[(\d+)\]/g, "[[$1]](#cite-$1)");
}
