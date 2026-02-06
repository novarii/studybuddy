"use client";

import React from "react";
import { KeyIcon, ExternalLinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ColorScheme } from "@/types";

type ConnectApiKeyDialogProps = {
  isOpen: boolean;
  colors: ColorScheme;
  onClose: () => void;
};

export const ConnectApiKeyDialog: React.FC<ConnectApiKeyDialogProps> = ({
  isOpen,
  colors,
  onClose,
}) => {
  const handleConnect = () => {
    // Redirect to OpenRouter OAuth flow
    window.location.href = "/api/openrouter/connect";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md"
        style={{ backgroundColor: colors.panel, borderColor: colors.border }}
      >
        <DialogHeader>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: colors.card }}
          >
            <KeyIcon className="w-6 h-6" style={{ color: colors.accent }} />
          </div>
          <DialogTitle
            className="text-center"
            style={{ color: colors.primaryText }}
          >
            Connect Your API Key
          </DialogTitle>
          <DialogDescription
            className="text-center"
            style={{ color: colors.secondaryText }}
          >
            To use StudyBuddy, you need to connect your OpenRouter API key. This
            lets you use your own AI credits for chat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              backgroundColor: colors.card,
              color: colors.secondaryText,
            }}
          >
            <p className="font-medium mb-1" style={{ color: colors.primaryText }}>
              Why OpenRouter?
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Access to multiple AI models</li>
              <li>Pay only for what you use</li>
              <li>Your API key stays encrypted</li>
            </ul>
          </div>

          <Button
            onClick={handleConnect}
            className="w-full"
            style={{
              backgroundColor: colors.accent,
              color: "#fff",
            }}
          >
            Connect with OpenRouter
            <ExternalLinkIcon className="w-4 h-4 ml-2" />
          </Button>

          <p
            className="text-xs text-center"
            style={{ color: colors.secondaryText }}
          >
            Don&apos;t have an account?{" "}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
              style={{ color: colors.accent }}
            >
              Sign up at OpenRouter
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
