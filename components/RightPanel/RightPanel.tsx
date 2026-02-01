"use client";

import React from "react";
import { PresentationIcon, PlayCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlidesSection } from "./SlidesSection";
import { VideoSection } from "./VideoSection";
import type { ColorScheme } from "@/types";
import { cn } from "@/lib/utils";

type RightPanelProps = {
  panelWidth: number;
  isResizing: boolean;
  isSlidesCollapsed: boolean;
  isVideoCollapsed: boolean;
  colors: ColorScheme;
  pageNumber: number;
  isPlaying: boolean;
  hasPdfMaterials: boolean;
  hasVideoMaterials: boolean;
  selectedDocumentId: string | null;
  onMouseDown: (e: React.MouseEvent) => void;
  onToggleSlides: () => void;
  onToggleVideo: () => void;
  onSetPlaying: (playing: boolean) => void;
  onUploadClick: () => void;
};

export const RightPanel: React.FC<RightPanelProps> = ({
  panelWidth,
  isResizing,
  isSlidesCollapsed,
  isVideoCollapsed,
  colors,
  pageNumber,
  isPlaying,
  hasPdfMaterials,
  hasVideoMaterials,
  selectedDocumentId,
  onMouseDown,
  onToggleSlides,
  onToggleVideo,
  onSetPlaying,
  onUploadClick,
}) => {
  const bothCollapsed = isSlidesCollapsed && isVideoCollapsed;

  return (
    <div
      className={cn("relative flex opacity-0 translate-y-[-1rem] animate-fade-in [--animation-delay:400ms]", isResizing ? "" : "transition-all duration-300")}
      style={{ width: bothCollapsed ? "60px" : `${panelWidth}px` }}
    >
      {!bothCollapsed && (
        <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10" onMouseDown={onMouseDown} style={{ backgroundColor: "transparent" }} />
      )}

      <aside className="border-l flex flex-col flex-1" style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
        {bothCollapsed ? (
          <>
            <div className="flex items-center justify-center p-4 border-b h-[57px]" style={{ borderColor: colors.border }}>
              <Button variant="ghost" size="icon" className="h-10 w-10" style={{ color: colors.primaryText }} onClick={onToggleSlides}>
                <PresentationIcon className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex items-center justify-center px-4 py-3 border-b" style={{ borderColor: colors.border }}>
              <Button variant="ghost" size="icon" className="h-6 w-6" style={{ color: colors.primaryText }} onClick={onToggleVideo}>
                <PlayCircleIcon className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <SlidesSection
              isCollapsed={isSlidesCollapsed}
              colors={colors}
              pageNumber={pageNumber}
              hasMaterials={hasPdfMaterials}
              documentId={selectedDocumentId}
              onToggle={onToggleSlides}
              onUploadClick={onUploadClick}
            />
            <VideoSection
              isCollapsed={isVideoCollapsed}
              colors={colors}
              isPlaying={isPlaying}
              hasVideos={hasVideoMaterials}
              onToggle={onToggleVideo}
              onSetPlaying={onSetPlaying}
            />
          </>
        )}
      </aside>
    </div>
  );
};
