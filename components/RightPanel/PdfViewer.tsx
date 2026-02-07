"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2Icon } from "lucide-react";
import type { ColorScheme } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      <Document
        file={pdfUrl}
        loading={loading}
        error={error}
        onLoadSuccess={onDocumentLoadSuccess}
      >
        {numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i + 1} ref={setPageRef(i + 1)}>
              <Page
                pageNumber={i + 1}
                width={containerWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </div>
          ))}
      </Document>
    </div>
  );
}
