"use client";

import React from "react";
import { FileTextIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Document, Course, ColorScheme } from "@/types";

type MaterialsDialogProps = {
  isOpen: boolean;
  documents: Document[];
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

export const MaterialsDialog: React.FC<MaterialsDialogProps> = ({
  isOpen,
  documents,
  currentCourse,
  colors,
  onClose,
  onDeleteDocument,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: colors.panel, borderColor: colors.border }} className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle style={{ color: colors.primaryText }}>Course Materials</DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>Manage materials for {currentCourse.code}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {documents.length === 0 ? (
            <div className="text-center py-8" style={{ color: colors.secondaryText }}>
              <FileTextIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No materials uploaded for this course yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: colors.primaryText }}>
                  Course Materials ({documents.length})
                </h3>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                      <FileTextIcon className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block" style={{ color: colors.primaryText }}>
                          {doc.filename}
                        </span>
                        <span className="text-xs" style={{ color: colors.secondaryText }}>
                          {formatFileSize(doc.size_bytes)}
                          {doc.page_count && ` - ${doc.page_count} pages`}
                        </span>
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
            </div>
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
