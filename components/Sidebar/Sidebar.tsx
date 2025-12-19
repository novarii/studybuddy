"use client";

import React from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SunIcon, MoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseDropdown } from "./CourseDropdown";
import { ContentsList } from "./ContentsList";
import type { Course, ColorScheme } from "@/types";
import { cn } from "@/lib/utils";

type SidebarProps = {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  courses: Course[];
  currentCourse: Course;
  selectedTopic: string;
  colors: ColorScheme;
  onCourseChange: (course: Course) => void;
  onTopicSelect: (topic: string) => void;
  onDeleteCourse: (courseId: string) => void;
  onCreateCourse: () => void;
  hoveredCourseId: string | null;
  setHoveredCourseId: (id: string | null) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  isDarkMode,
  setIsDarkMode,
  courses,
  currentCourse,
  selectedTopic,
  colors,
  onCourseChange,
  onTopicSelect,
  onDeleteCourse,
  onCreateCourse,
  hoveredCourseId,
  setHoveredCourseId,
}) => {
  return (
    <aside
      className={cn(
        "border-r flex flex-col opacity-0 translate-y-[-1rem] animate-fade-in [--animation-delay:0ms] transition-all duration-300 flex-shrink-0",
        isCollapsed ? "w-[60px]" : "w-[280px]"
      )}
      style={{ backgroundColor: colors.panel, borderColor: colors.border }}
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
              onCreateCourse={onCreateCourse}
              hoveredCourseId={hoveredCourseId}
              setHoveredCourseId={setHoveredCourseId}
            />

            <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
              <h1 className="text-sm font-semibold truncate" style={{ color: colors.primaryText }}>
                {currentCourse.name}
              </h1>
            </div>

            <button
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center"
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ color: colors.primaryText }}
            >
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
          </header>

          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: colors.border }}>
            <h2 className="text-sm font-medium" style={{ color: colors.primaryText }}>
              Contents
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              style={{ color: colors.primaryText }}
              onClick={() => setIsCollapsed(true)}
            >
              <PanelLeftCloseIcon className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <ContentsList
              content={currentCourse.content}
              selectedTopic={selectedTopic}
              colors={colors}
              onTopicSelect={onTopicSelect}
            />
          </ScrollArea>
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
              onCreateCourse={onCreateCourse}
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
