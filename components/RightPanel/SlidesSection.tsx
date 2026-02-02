"use client";

import React from "react";
import { ChevronUpIcon, ChevronDownIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ColorScheme } from "@/types";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type SlidesSectionProps = {
  isCollapsed: boolean;
  colors: ColorScheme;
  pageNumber: number;
  hasMaterials: boolean;
  documentId: string | null;
  onToggle: () => void;
  onUploadClick: () => void;
};

export const SlidesSection: React.FC<SlidesSectionProps> = ({ isCollapsed, colors, pageNumber, hasMaterials, documentId, onToggle, onUploadClick }) => {
  // Construct PDF URL from document ID
  const pdfUrl = documentId ? `${API_BASE}/documents/${documentId}/file#page=${pageNumber}` : null;
  return (
    <section
      className={cn("flex flex-col border-b transition-all duration-300", isCollapsed ? "flex-none" : "")}
      style={{
        borderColor: colors.border,
        minHeight: isCollapsed ? "auto" : "50%",
        flex: isCollapsed ? "none" : "1 1 55%",
      }}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
        <h2 className="text-lg font-semibold" style={{ color: colors.primaryText }}>
          Slides
        </h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" style={{ color: colors.primaryText }} onClick={onToggle}>
          {isCollapsed ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronUpIcon className="w-5 h-5" />}
        </Button>
      </header>

      {!isCollapsed && (
        <div className="flex-1 p-4 overflow-hidden">
          <Card className="overflow-hidden h-full flex items-center justify-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            {hasMaterials && pdfUrl ? (
              <CardContent className="p-0 h-full w-full">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                  key={`${documentId}-${pageNumber}`}
                />
              </CardContent>
            ) : hasMaterials ? (
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.panel }}
                  >
                    <UploadIcon className="w-8 h-8" style={{ color: colors.accent }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primaryText }}>
                      Click a Citation
                    </h3>
                    <p className="text-sm mb-4" style={{ color: colors.secondaryText }}>
                      Click on a citation [1], [2], etc. in the chat to view the source slide
                    </p>
                  </div>
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.panel }}
                  >
                    <UploadIcon className="w-8 h-8" style={{ color: colors.accent }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primaryText }}>
                      No Course Materials
                    </h3>
                    <p className="text-sm mb-4" style={{ color: colors.secondaryText }}>
                      Upload PDFs, slides, or course materials to get started
                    </p>
                  </div>
                  <Button
                    onClick={onUploadClick}
                    style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}
                  >
                    <UploadIcon className="w-4 h-4 mr-2" />
                    Upload Materials
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </section>
  );
};
