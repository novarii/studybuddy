"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, LoaderIcon, Trash2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ColorScheme } from "@/types";

type AgentKey = {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type AgentKeysDialogProps = {
  isOpen: boolean;
  colors: ColorScheme;
  onClose: () => void;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const AgentKeysDialog: React.FC<AgentKeysDialogProps> = ({
  isOpen,
  colors,
  onClose,
}) => {
  const { toast } = useToast();
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [label, setLabel] = useState("");
  // Raw key is only returned once, on creation
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/user/agent-keys");
      if (!res.ok) throw new Error(`Failed to load keys (${res.status})`);
      const data = await res.json();
      setKeys(data.keys);
    } catch (error) {
      toast({
        title: "Couldn't load API keys",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      fetchKeys();
    } else {
      // Never keep the raw key around after the dialog closes
      setNewKey(null);
      setCopied(false);
      setLabel("");
    }
  }, [isOpen, fetchKeys]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/user/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Failed to create key (${res.status})`);
      const data = await res.json();
      setNewKey(data.key);
      setCopied(false);
      setLabel("");
      fetchKeys();
    } catch (error) {
      toast({
        title: "Couldn't create API key",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  };

  const handleRevoke = async (key: AgentKey) => {
    const name = key.label || "this key";
    if (!window.confirm(`Revoke ${name}? Anything using it will stop working.`)) return;
    try {
      const res = await fetch(`/api/user/agent-keys/${key.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to revoke key (${res.status})`);
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
    } catch (error) {
      toast({
        title: "Couldn't revoke API key",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg"
        style={{ backgroundColor: colors.panel, borderColor: colors.border }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: colors.primaryText }}>
            Agent API keys
          </DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>
            Let AI agents like Claude Code search your course materials. Send
            the key in the <code>X-API-Key</code> header to{" "}
            <code>/api/agent/*</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {newKey && (
            <div
              className="p-3 rounded-lg space-y-2"
              style={{ backgroundColor: colors.card, border: `1px solid ${colors.accent}` }}
            >
              <p className="text-sm font-medium" style={{ color: colors.primaryText }}>
                Copy your new key now. You won&apos;t be able to see it again.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={newKey}
                  onFocus={(e) => e.target.select()}
                  className="font-mono text-xs"
                  style={{ color: colors.primaryText, borderColor: colors.border }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy key"
                  style={{ borderColor: colors.border, color: colors.primaryText }}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Label (e.g. Claude Code)"
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isCreating && handleCreate()}
              style={{ color: colors.primaryText, borderColor: colors.border }}
            />
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              style={{ backgroundColor: colors.accent, color: "#fff" }}
            >
              {isCreating ? <LoaderIcon className="animate-spin" /> : <KeyRoundIcon />}
              Create key
            </Button>
          </div>

          <div className="space-y-2">
            {isLoading && keys.length === 0 ? (
              <div className="flex justify-center py-4">
                <LoaderIcon className="w-4 h-4 animate-spin" style={{ color: colors.secondaryText }} />
              </div>
            ) : keys.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: colors.secondaryText }}>
                No API keys yet.
              </p>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg"
                  style={{ backgroundColor: colors.card }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: colors.primaryText }}>
                      {key.label || "Untitled key"}
                    </p>
                    <p className="text-xs" style={{ color: colors.secondaryText }}>
                      Created {formatDate(key.createdAt)} ·{" "}
                      {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(key)}
                    aria-label={`Revoke ${key.label || "key"}`}
                    style={{ color: colors.secondaryText }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
