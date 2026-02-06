"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { PaperclipIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ColorScheme } from "@/types";

interface ChatInputProps {
  colors: ColorScheme;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Fully isolated chat input component with LOCAL state.
 * Does NOT receive inputValue from parent - manages its own state.
 * This prevents parent re-renders from affecting typing performance.
 */
export function ChatInput({
  colors,
  isLoading,
  onSendMessage,
  onFileSelect,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Local state - parent doesn't control this, so parent re-renders don't affect us
  const [localInput, setLocalInput] = useState("");

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  // Clear input after sending
  useEffect(() => {
    if (isLoading) {
      setLocalInput("");
    }
  }, [isLoading]);

  const handleSend = useCallback(() => {
    const message = localInput.trim();
    if (message && !isLoading) {
      onSendMessage(message);
    }
  }, [localInput, isLoading, onSendMessage]);

  const hasInput = localInput.trim().length > 0;

  return (
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
        value={localInput}
        onChange={(e) => setLocalInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
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
          onClick={handleSend}
          disabled={isLoading || !hasInput}
        >
          <SendIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
