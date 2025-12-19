"use client";

import React, { useRef, useEffect } from "react";
import { SlidersHorizontalIcon, UploadIcon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedText } from "@/components/Chat/AnimatedText";
import type { ColorScheme, ChatMessage } from "@/types";

type MainContentProps = {
  colors: ColorScheme;
  isDragging: boolean;
  uploadedFiles: File[];
  messages: ChatMessage[];
  inputValue: string;
  isLoading: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onSaveMaterials: () => void;
  onOpenMaterials: () => void;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
};

export const MainContent: React.FC<MainContentProps> = ({
  colors,
  isDragging,
  uploadedFiles,
  messages,
  inputValue,
  isLoading,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemoveFile,
  onSaveMaterials,
  onOpenMaterials,
  onInputChange,
  onSendMessage,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  return (
    <main className="flex-1 flex flex-col opacity-0 translate-y-[-1rem] animate-fade-in [--animation-delay:200ms]">
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
        <h2 className="text-lg font-semibold" style={{ color: colors.primaryText }}>
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

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              <div className="text-center py-12" style={{ color: colors.secondaryText }}>
                <p className="text-sm">Start a conversation by asking a question about your course materials</p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "user" ? (
                      <div
                        className="max-w-[80%] rounded-lg p-3 rounded-br-none"
                        style={{
                          backgroundColor: colors.accent,
                          color: colors.buttonIcon,
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <span className="text-xs opacity-70 mt-1 block">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="max-w-[80%] p-3"
                        style={{
                          color: colors.primaryText,
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {message.isTyping ? (
                            <span className="flex items-center gap-2">
                              <span className="flex gap-1">
                                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: "0ms" }} />
                                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: "150ms" }} />
                                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: "300ms" }} />
                              </span>
                              <span className="text-sm">Thinking...</span>
                            </span>
                          ) : (
                            <AnimatedText text={message.content} />
                          )}
                        </p>
                        <span className="text-xs opacity-70 mt-1 block">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </ScrollArea>

        {uploadedFiles.length > 0 && (
          <div className="mb-3">
            <div className="space-y-2 mb-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: colors.panel, borderColor: colors.border }}
                >
                  <PaperclipIcon className="w-4 h-4 flex-shrink-0" style={{ color: colors.secondaryText }} />
                  <span className="text-sm flex-1 truncate" style={{ color: colors.primaryText }}>
                    {file.name}
                  </span>
                  <button onClick={() => onRemoveFile(index)} className="flex-shrink-0" style={{ color: colors.secondaryText }}>
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              onClick={onSaveMaterials}
              style={{
                backgroundColor: colors.accent,
                color: colors.buttonIcon,
                width: "100%",
              }}
            >
              Save Materials to Course
            </Button>
          </div>
        )}

        <div className="relative flex-shrink-0">
          <Textarea
            ref={textareaRef}
            placeholder="Ask about the lecture content or paste a problem..."
            className="pr-20 min-h-[60px] max-h-[200px] rounded-lg resize-none overflow-y-auto"
            style={{
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.primaryText,
              paddingRight: "5rem",
            }}
            rows={2}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            disabled={isLoading}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <input type="file" id="file-upload-input" multiple accept=".pdf" className="hidden" onChange={onFileSelect} />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              style={{ color: colors.primaryText }}
              onClick={() => document.getElementById("file-upload-input")?.click()}
              disabled={isLoading}
            >
              <PaperclipIcon className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 rounded-full"
              style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}
              onClick={onSendMessage}
              disabled={isLoading || !inputValue.trim()}
            >
              <SendIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <footer className="text-center text-xs mt-4 flex-shrink-0" style={{ color: colors.secondaryText }}>
          StudyBuddy@2025 | All rights reserved
        </footer>
      </div>
    </main>
  );
};
