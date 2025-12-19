"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ColorScheme } from "@/types";

type CreateCourseDialogProps = {
  isOpen: boolean;
  courseName: string;
  colors: ColorScheme;
  onClose: () => void;
  onCourseNameChange: (name: string) => void;
  onCreate: () => void;
};

export const CreateCourseDialog: React.FC<CreateCourseDialogProps> = ({ isOpen, courseName, colors, onClose, onCourseNameChange, onCreate }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && courseName.trim()) {
      onCreate();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
        <DialogHeader>
          <DialogTitle style={{ color: colors.primaryText }}>Create New Course</DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>Enter course code and name</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: colors.primaryText }}>
              Course Code & Name
            </label>
            <Input
              placeholder="e.g., CSC242 Introduction to AI"
              value={courseName}
              onChange={(e) => onCourseNameChange(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.primaryText,
              }}
              autoFocus
            />
            <p className="text-xs mt-1" style={{ color: colors.secondaryText }}>
              Enter any course name (e.g., CSC242 Introduction to AI or Introduction to AI)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} style={{ color: colors.primaryText }}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={!courseName.trim()} style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}>
            Create Course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
