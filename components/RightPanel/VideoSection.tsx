"use client";

import React from "react";
import { ChevronUpIcon, ChevronDownIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ColorScheme } from "@/types";
import { cn } from "@/lib/utils";

type VideoSectionProps = {
  isCollapsed: boolean;
  colors: ColorScheme;
  hasVideos: boolean;
  panoptoSessionId: string | null;
  startSeconds: number;
  onToggle: () => void;
};

/**
 * Build Panopto embed URL with optional start time.
 */
function buildPanoptoEmbedUrl(sessionId: string, startSeconds: number): string {
  const params = new URLSearchParams({
    id: sessionId,
    autoplay: startSeconds > 0 ? "true" : "false",
    offerviewer: "true",
    showtitle: "true",
    showbrand: "true",
    captions: "false",
    interactivity: "all",
  });

  if (startSeconds > 0) {
    params.set("start", String(Math.floor(startSeconds)));
  }

  return `https://rochester.hosted.panopto.com/Panopto/Pages/Embed.aspx?${params.toString()}`;
}

export const VideoSection: React.FC<VideoSectionProps> = ({
  isCollapsed,
  colors,
  hasVideos,
  panoptoSessionId,
  startSeconds,
  onToggle,
}) => {
  // Generate a unique key to force iframe reload when session or timestamp changes
  const iframeKey = panoptoSessionId ? `${panoptoSessionId}-${startSeconds}` : null;

  return (
    <section
      className={cn("flex flex-col transition-all duration-300", isCollapsed ? "flex-none" : "")}
      style={{
        flex: isCollapsed ? "none" : "1 1 45%",
        minHeight: isCollapsed ? "auto" : "40%",
      }}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
        <h2 className="text-lg font-semibold" style={{ color: colors.primaryText }}>
          Lecture Clip
        </h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" style={{ color: colors.primaryText }} onClick={onToggle}>
          {isCollapsed ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronUpIcon className="w-5 h-5" />}
        </Button>
      </header>

      {!isCollapsed && (
        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          <Card className="overflow-hidden flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            {panoptoSessionId ? (
              <CardContent className="p-0 flex-1 flex flex-col overflow-hidden w-full">
                <div className="relative flex-1 bg-black overflow-hidden">
                  <iframe
                    key={iframeKey}
                    src={buildPanoptoEmbedUrl(panoptoSessionId, startSeconds)}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    title="Panopto Lecture"
                  />
                </div>
              </CardContent>
            ) : hasVideos ? (
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.panel }}
                  >
                    <VideoIcon className="w-8 h-8" style={{ color: colors.accent }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primaryText }}>
                      Select a Lecture Reference
                    </h3>
                    <p className="text-sm" style={{ color: colors.secondaryText }}>
                      Click on a lecture citation in the chat to view the video
                    </p>
                  </div>
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.panel }}
                  >
                    <VideoIcon className="w-8 h-8" style={{ color: colors.accent }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primaryText }}>
                      No Lecture Recordings
                    </h3>
                    <p className="text-sm mb-4" style={{ color: colors.secondaryText }}>
                      Use our browser extension to capture lecture recordings
                    </p>
                  </div>
                  <Button
                    style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}
                    onClick={() => window.open('https://chrome.google.com/webstore', '_blank')}
                  >
                    <VideoIcon className="w-4 h-4 mr-2" />
                    Get Extension
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </section>
  );
};
