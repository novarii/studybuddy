"use client";

import React from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SunIcon, MoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseDropdown } from "./CourseDropdown";
import { ChatsSection } from "./ChatsSection";
import type { Course, ColorScheme, ChatSession } from "@/types";
import { cn } from "@/lib/utils";

// Fixed sidebar width
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 60;

type SidebarProps = {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  courses: Course[];
  currentCourse: Course;
  colors: ColorScheme;
  onCourseChange: (course: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddCourse: () => void;
  hoveredCourseId: string | null;
  setHoveredCourseId: (id: string | null) => void;
  // Session props
  sessions: ChatSession[];
  currentSessionId: string | null;
  isSessionsLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  isDarkMode,
  setIsDarkMode,
  courses,
  currentCourse,
  colors,
  onCourseChange,
  onDeleteCourse,
  onAddCourse,
  hoveredCourseId,
  setHoveredCourseId,
  sessions,
  currentSessionId,
  isSessionsLoading,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  return (
    <aside
      className={cn(
        "border-r flex flex-col opacity-0 translate-y-[-1rem] animate-fade-in [--animation-delay:0ms] flex-shrink-0",
        "transition-all duration-300"
      )}
      style={{
        backgroundColor: colors.panel,
        borderColor: colors.border,
        width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
      }}
    >
      {!isCollapsed ? (
        <>
          <header className="flex items-center p-4 border-b" style={{ borderColor: colors.border }}>
            <CourseDropdown
              courses={courses}
              currentCourse={currentCourse}
              colors={colors}
              onCourseChange={onCourseChange}
              onDeleteCourse={onDeleteCourse}
              onAddCourse={onAddCourse}
              hoveredCourseId={hoveredCourseId}
              setHoveredCourseId={setHoveredCourseId}
            />

            <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
              <div className="truncate">
                <h1 className="text-sm font-semibold truncate" style={{ color: colors.primaryText }}>
                  {currentCourse.code}
                </h1>
                <p className="text-xs truncate" style={{ color: colors.secondaryText }}>
                  {currentCourse.title}
                </p>
              </div>
            </div>

            <button
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center"
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ color: colors.primaryText }}
            >
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
          </header>

          <div className="flex items-center justify-end px-4 py-2 border-b" style={{ borderColor: colors.border }}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              style={{ color: colors.primaryText }}
              onClick={() => setIsCollapsed(true)}
              title="Collapse sidebar"
            >
              <PanelLeftCloseIcon className="w-4 h-4" />
            </Button>
          </div>

          <ChatsSection
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={isSessionsLoading}
            colors={colors}
            onSelectSession={onSelectSession}
            onNewChat={onNewChat}
            onDeleteSession={onDeleteSession}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-center p-4 border-b h-[57px]" style={{ borderColor: colors.border }}>
            <CourseDropdown
              courses={courses}
              currentCourse={currentCourse}
              colors={colors}
              onCourseChange={onCourseChange}
              onDeleteCourse={onDeleteCourse}
              onAddCourse={onAddCourse}
              hoveredCourseId={hoveredCourseId}
              setHoveredCourseId={setHoveredCourseId}
              iconOnly
            />
          </div>

          <div className="flex items-center justify-center px-4 py-3 border-b" style={{ borderColor: colors.border }}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              style={{ color: colors.primaryText }}
              onClick={() => setIsCollapsed(false)}
            >
              <PanelLeftOpenIcon className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center justify-center px-4 py-3">
            <button
              className="h-6 w-6 flex items-center justify-center"
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ color: colors.primaryText }}
            >
              {isDarkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
