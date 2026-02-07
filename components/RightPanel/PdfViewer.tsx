"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2Icon } from "lucide-react";
import type { ColorScheme } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** How many pages above/below the viewport to keep rendered */
const PAGE_BUFFER = 2;

type PdfViewerProps = {
  documentId: string;
  pageNumber: number;
  colors: ColorScheme;
};

export default function PdfViewer({
  documentId,
  pageNumber,
  colors,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState<number | undefined>(
    undefined
  );
  const [numPages, setNumPages] = useState<number>(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  // Estimated page height (updated once first page renders)
  const [pageHeight, setPageHeight] = useState<number>(0);

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  // IntersectionObserver to track which pages are near the viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const page = Number(entry.target.getAttribute("data-page"));
            if (entry.isIntersecting) {
              next.add(page);
            } else {
              next.delete(page);
            }
          }
          return next;
        });
      },
      {
        root: container,
        // Render pages 1 full viewport height ahead in each direction
        rootMargin: "100% 0px 100% 0px",
      }
    );

    // Observe all page wrapper divs
    for (const [, el] of pageRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [numPages, pageHeight]); // Re-attach after pages are measured

  // Scroll to the target page when pageNumber changes
  useEffect(() => {
    const el = pageRefs.current.get(pageNumber);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pageNumber]);

  const setPageRef = useCallback(
    (page: number) => (el: HTMLDivElement | null) => {
      if (el) {
        pageRefs.current.set(page, el);
      } else {
        pageRefs.current.delete(page);
      }
    },
    []
  );

  const pdfUrl = `/api/documents/${documentId}/file`;

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total);
    },
    []
  );

  // Capture rendered page height from the first page for placeholder sizing
  const onFirstPageRender = useCallback(() => {
    const el = pageRefs.current.get(1);
    if (el && !pageHeight) {
      setPageHeight(el.getBoundingClientRect().height);
    }
  }, [pageHeight]);

  const loading = useCallback(
    () => (
      <div className="flex items-center justify-center h-full w-full py-12">
        <Loader2Icon
          className="w-8 h-8 animate-spin"
          style={{ color: colors.accent }}
        />
      </div>
    ),
    [colors.accent]
  );

  const error = useCallback(
    () => (
      <div className="flex items-center justify-center h-full w-full py-12">
        <p className="text-sm" style={{ color: colors.secondaryText }}>
          Failed to load PDF
        </p>
      </div>
    ),
    [colors.secondaryText]
  );

  // Determine which pages should be rendered (visible + buffer)
  const shouldRender = useCallback(
    (page: number) => {
      // Always render first few pages on initial load before intersection fires
      if (visiblePages.size === 0) return page <= PAGE_BUFFER + 1;
      for (const v of visiblePages) {
        if (Math.abs(v - page) <= PAGE_BUFFER) return true;
      }
      return false;
    },
    [visiblePages]
  );

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      <Document
        file={pdfUrl}
        loading={loading}
        error={error}
        onLoadSuccess={onDocumentLoadSuccess}
      >
        {numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => {
            const page = i + 1;
            const render = shouldRender(page);
            return (
              <div
                key={page}
                ref={setPageRef(page)}
                data-page={page}
                style={
                  !render && pageHeight
                    ? { height: pageHeight, width: containerWidth }
                    : undefined
                }
              >
                {render && (
                  <Page
                    pageNumber={page}
                    width={containerWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onRenderSuccess={page === 1 ? onFirstPageRender : undefined}
                  />
                )}
              </div>
            );
          })}
      </Document>
    </div>
  );
}
