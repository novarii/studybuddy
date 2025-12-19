"use client";

import React from "react";
import { ChevronUpIcon, ChevronDownIcon, SkipBackIcon, PlayIcon, PauseIcon, SkipForwardIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ColorScheme } from "@/types";
import { cn } from "@/lib/utils";

type VideoSectionProps = {
  isCollapsed: boolean;
  colors: ColorScheme;
  isPlaying: boolean;
  hasVideos: boolean;
  onToggle: () => void;
  onSetPlaying: (playing: boolean) => void;
};

export const VideoSection: React.FC<VideoSectionProps> = ({ isCollapsed, colors, isPlaying, hasVideos, onToggle, onSetPlaying }) => {
  const handleSkipBack = () => {
    const video = document.querySelector("video");
    if (video) video.currentTime -= 10;
  };

  const handleSkipForward = () => {
    const video = document.querySelector("video");
    if (video) video.currentTime += 10;
  };

  const handlePlayPause = () => {
    const video = document.querySelector("video");
    if (video) {
      if (isPlaying) {
        video.pause();
      } else {
        video.play();
      }
      onSetPlaying(!isPlaying);
    }
  };

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
            {hasVideos ? (
              <CardContent className="p-0 flex-1 flex flex-col overflow-hidden w-full">
                <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                  <video className="w-full h-full object-contain" src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
                    Your browser does not support the video tag.
                  </video>
                </div>
                <div className="p-4 border-t flex items-center justify-center gap-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                  <Button variant="ghost" size="icon" className="h-10 w-10" style={{ color: colors.primaryText }} onClick={handleSkipBack}>
                    <SkipBackIcon className="w-5 h-5" />
                  </Button>
                  <Button size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: colors.accent, color: colors.buttonIcon }} onClick={handlePlayPause}>
                    {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" style={{ color: colors.primaryText }} onClick={handleSkipForward}>
                    <SkipForwardIcon className="w-5 h-5" />
                  </Button>
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
