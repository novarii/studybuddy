"use client";

import React from "react";
import { FileTextIcon, VideoIcon, TrashIcon, CheckCircleIcon, LoaderIcon, AlertCircleIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Document, Lecture, Course, ColorScheme } from "@/types";

type MaterialsDialogProps = {
  isOpen: boolean;
  documents: Document[];
  lectures: Lecture[];
  currentCourse: Course;
  colors: ColorScheme;
  onClose: () => void;
  onDeleteDocument: (documentId: string) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function DocumentStatusBadge({ status, colors }: { status: Document["status"]; colors: ColorScheme }) {
  switch (status) {
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: colors.accent }}>
          <LoaderIcon className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircleIcon className="w-3 h-3" />
          Failed
        </span>
      );
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <CheckCircleIcon className="w-3 h-3" />
          Ready
        </span>
      );
  }
}

function LectureStatusBadge({ status, errorMessage, colors }: { status: Lecture["status"]; errorMessage: string | null; colors: ColorScheme }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: colors.secondaryText }}>
          <ClockIcon className="w-3 h-3" />
          Pending
        </span>
      );
    case "downloading":
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: colors.accent }}>
          <LoaderIcon className="w-3 h-3 animate-spin" />
          Downloading
        </span>
      );
    case "transcribing":
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: colors.accent }}>
          <LoaderIcon className="w-3 h-3 animate-spin" />
          Transcribing
        </span>
      );
    case "chunking":
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: colors.accent }}>
          <LoaderIcon className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-500" title={errorMessage ?? undefined}>
          <AlertCircleIcon className="w-3 h-3" />
          Failed
        </span>
      );
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <CheckCircleIcon className="w-3 h-3" />
          Ready
        </span>
      );
  }
}

export const MaterialsDialog: React.FC<MaterialsDialogProps> = ({
  isOpen,
  documents,
  lectures,
  currentCourse,
  colors,
  onClose,
  onDeleteDocument,
}) => {
  const isEmpty = documents.length === 0 && lectures.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: colors.panel, borderColor: colors.border }} className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle style={{ color: colors.primaryText }}>Course Materials</DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>Manage materials for {currentCourse.code}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {isEmpty ? (
            <div className="text-center py-8" style={{ color: colors.secondaryText }}>
              <FileTextIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No materials uploaded for this course yet.</p>
            </div>
          ) : (
            <>
              {/* Documents Section */}
              {documents.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: colors.primaryText }}>
                    Documents ({documents.length})
                  </h3>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <FileTextIcon className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block" style={{ color: colors.primaryText }}>
                            {doc.filename}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: colors.secondaryText }}>
                              {doc.size_bytes && formatFileSize(doc.size_bytes)}
                              {doc.page_count && `${doc.size_bytes ? " - " : ""}${doc.page_count} pages`}
                            </span>
                            <DocumentStatusBadge status={doc.status} colors={colors} />
                          </div>
                        </div>
                        <button
                          onClick={() => onDeleteDocument(doc.id)}
                          className="flex-shrink-0 hover:opacity-70 transition-opacity"
                          style={{ color: colors.primaryText }}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lectures Section */}
              {lectures.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: colors.primaryText }}>
                    Lectures ({lectures.length})
                  </h3>
                  <div className="space-y-2">
                    {lectures.map((lecture) => (
                      <div key={lecture.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <VideoIcon className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block" style={{ color: colors.primaryText }}>
                            {lecture.title ?? "Untitled Lecture"}
                          </span>
                          <div className="flex items-center gap-2">
                            {lecture.duration_seconds && (
                              <span className="text-xs" style={{ color: colors.secondaryText }}>
                                {formatDuration(lecture.duration_seconds)}
                              </span>
                            )}
                            <LectureStatusBadge status={lecture.status} errorMessage={lecture.error_message} colors={colors} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
