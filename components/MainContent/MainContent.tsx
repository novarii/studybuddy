"use client";

import React from "react";
import Image from "next/image";
import { SlidersHorizontalIcon, UploadIcon, PaperclipIcon, XIcon, CheckIcon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/components/Chat/MessageList";
import { ChatInput } from "@/components/Chat/ChatInput";
import type { ColorScheme, ChatMessage, RAGSource } from "@/types";
import type { UploadItem } from "@/hooks/useDocumentUpload";

type MainContentProps = {
  colors: ColorScheme;
  isDragging: boolean;
  uploads: UploadItem[];
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistory?: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveUpload: (id: string) => void;
  onClearCompleted: () => void;
  onOpenMaterials: () => void;
  onSendMessage: (message: string) => void;
  onCitationClick?: (source: RAGSource) => void;
};

export const MainContent: React.FC<MainContentProps> = ({
  colors,
  isDragging,
  uploads,
  messages,
  isLoading,
  isLoadingHistory,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemoveUpload,
  onClearCompleted,
  onOpenMaterials,
  onSendMessage,
  onCitationClick,
}) => {
  const completedUploads = uploads.filter((u) => u.status === "success");
  const hasCompletedUploads = completedUploads.length > 0;

  return (
    <main className="flex-1 flex flex-col opacity-0 translate-y-[-1rem] animate-fade-in [--animation-delay:200ms]">
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: colors.primaryText }}>
          <Image src="/icon.png" alt="" width={24} height={24} />
          StudyBuddy
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          style={{ color: colors.primaryText }}
          onClick={onOpenMaterials}
        >
          <SlidersHorizontalIcon className="w-5 h-5" />
        </Button>
      </header>

      <div
        className="flex-1 flex flex-col p-6 relative overflow-hidden"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: `${colors.background}ee` }}>
            <div className="border-2 border-dashed rounded-lg p-12 text-center" style={{ borderColor: colors.accent }}>
              <UploadIcon className="w-16 h-16 mx-auto mb-4" style={{ color: colors.accent }} />
              <p className="text-lg font-semibold mb-2" style={{ color: colors.primaryText }}>
                Drop PDF files here
              </p>
              <p className="text-sm" style={{ color: colors.secondaryText }}>
                Upload course materials, slides, or documents
              </p>
            </div>
          </div>
        )}

        <MessageList
          messages={messages}
          colors={colors}
          isLoadingHistory={isLoadingHistory}
          onCitationClick={onCitationClick}
        />

        {uploads.length > 0 && (
          <div className="mb-3 space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: colors.panel, borderColor: colors.border }}
              >
                {upload.status === "success" ? (
                  <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                ) : upload.status === "error" ? (
                  <AlertCircleIcon className="w-4 h-4 flex-shrink-0" style={{ color: "#ef4444" }} />
                ) : (
                  <PaperclipIcon className="w-4 h-4 flex-shrink-0" style={{ color: colors.secondaryText }} />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate block" style={{ color: colors.primaryText }}>
                    {upload.file.name}
                  </span>
                  {upload.status === "uploading" && (
                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${upload.progress}%`, backgroundColor: colors.accent }}
                      />
                    </div>
                  )}
                  {upload.status === "error" && upload.error && (
                    <span className="text-xs" style={{ color: "#ef4444" }}>
                      {upload.error}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveUpload(upload.id)}
                  className="flex-shrink-0"
                  style={{ color: colors.secondaryText }}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            {hasCompletedUploads && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClearCompleted}
                className="w-full text-xs"
                style={{ color: colors.secondaryText }}
              >
                Clear completed uploads
              </Button>
            )}
          </div>
        )}

        <ChatInput
          colors={colors}
          isLoading={isLoading}
          onSendMessage={onSendMessage}
          onFileSelect={onFileSelect}
        />

        <footer className="text-center text-xs mt-4 flex-shrink-0" style={{ color: colors.secondaryText }}>
          StudyBuddy@2025 | All rights reserved
        </footer>
      </div>
    </main>
  );
};
