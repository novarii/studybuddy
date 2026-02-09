"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2Icon } from "lucide-react";
import type { ColorScheme } from "@/types";

// Use legacy build — targets ES5, works on iOS 16 Safari without polyfills
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.js",
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
  // Aspect ratio (height/width) from PDF metadata — pageHeight derived from containerWidth
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(0);
  const pageHeight = containerWidth ? containerWidth * pageAspectRatio : 0;
  const [loadError, setLoadError] = useState<string>("");

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
  // Wait for pageHeight so placeholders have real dimensions before observing
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0 || !pageAspectRatio) return;

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
  }, [numPages, pageAspectRatio]); // Re-attach after pages are measured

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
    async (pdf: { numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number } }> }) => {
      setNumPages(pdf.numPages);
      // Read first page dimensions from PDF metadata (no canvas allocation)
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      setPageAspectRatio(viewport.height / viewport.width);
    },
    []
  );

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

  const onLoadError = useCallback((err: Error) => {
    setLoadError(err?.message || String(err));
  }, []);

  const error = useCallback(
    () => (
      <div className="flex items-center justify-center h-full w-full py-12 px-4">
        <p className="text-xs font-mono break-all" style={{ color: colors.secondaryText }}>
          {loadError || "Failed to load PDF"}
        </p>
      </div>
    ),
    [colors.secondaryText, loadError]
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
    <div ref={containerRef} className="h-full w-full overflow-auto min-w-0">
      <Document
        file={pdfUrl}
        loading={loading}
        error={error}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onLoadError}
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
                  !render
                    ? { height: pageHeight || (containerWidth ? containerWidth * 0.75 : 400), width: containerWidth }
                    : undefined
                }
              >
                {render && (
                  <Page
                    pageNumber={page}
                    width={containerWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                )}
              </div>
            );
          })}
      </Document>
    </div>
  );
}
