"use client";

import React from "react";
import { BookOpenIcon, UploadIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColorScheme } from "@/types";

type EmptyStateProps = {
  colors: ColorScheme;
  onCreateCourse: () => void;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ colors, onCreateCourse }) => {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="mb-6 flex justify-center">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.panel }}
          >
            <BookOpenIcon className="w-12 h-12" style={{ color: colors.accent }} />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-3" style={{ color: colors.primaryText }}>
          Welcome to StudyBuddy
        </h2>

        <p className="text-sm mb-6" style={{ color: colors.secondaryText }}>
          Get started by creating your first course. Upload materials, and let our AI assistant help you study smarter.
        </p>

        <div className="space-y-4">
          <Button
            onClick={onCreateCourse}
            className="w-full"
            style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Create Your First Course
          </Button>

          <div className="flex items-center gap-4 text-xs" style={{ color: colors.secondaryText }}>
            <div className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
            <span>Features</span>
            <div className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
          </div>

          <div className="grid grid-cols-1 gap-3 text-left">
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: colors.panel }}>
              <UploadIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
              <div>
                <h4 className="text-sm font-medium mb-1" style={{ color: colors.primaryText }}>
                  Upload Materials
                </h4>
                <p className="text-xs" style={{ color: colors.secondaryText }}>
                  Add PDFs, slides, and lecture recordings
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: colors.panel }}>
              <BookOpenIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
              <div>
                <h4 className="text-sm font-medium mb-1" style={{ color: colors.primaryText }}>
                  AI-Powered Learning
                </h4>
                <p className="text-xs" style={{ color: colors.secondaryText }}>
                  Ask questions and get instant answers
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
