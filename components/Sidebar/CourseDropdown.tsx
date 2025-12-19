"use client";

import React from "react";
import { MenuIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Course, ColorScheme } from "@/types";

type CourseDropdownProps = {
  courses: Course[];
  currentCourse: Course;
  colors: ColorScheme;
  onCourseChange: (course: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  onCreateCourse: () => void;
  hoveredCourseId: string | null;
  setHoveredCourseId: (id: string | null) => void;
  iconOnly?: boolean;
};

export const CourseDropdown: React.FC<CourseDropdownProps> = ({
  courses,
  currentCourse,
  colors,
  onCourseChange,
  onDeleteCourse,
  onCreateCourse,
  hoveredCourseId,
  setHoveredCourseId,
  iconOnly = false,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={iconOnly ? "h-10 w-10" : "h-8 w-8 flex-shrink-0"}
          style={{ color: colors.primaryText }}
        >
          <MenuIcon className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
        <DropdownMenuLabel style={{ color: colors.primaryText }}>Select Course</DropdownMenuLabel>
        <DropdownMenuSeparator style={{ backgroundColor: colors.border }} />
        {courses.map((course) => (
          <div
            key={course.id}
            className="relative"
            onMouseEnter={() => setHoveredCourseId(course.id)}
            onMouseLeave={() => setHoveredCourseId(null)}
          >
            <DropdownMenuItem
              onClick={() => onCourseChange(course)}
              className="cursor-pointer flex items-center justify-between pr-2"
              style={{
                color: colors.primaryText,
                backgroundColor: currentCourse.id === course.id ? colors.hover : "transparent",
                fontWeight: currentCourse.id === course.id ? "bold" : "normal",
              }}
            >
              <span className="truncate flex-1">{course.name}</span>
              {hoveredCourseId === course.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCourse(course.id);
                  }}
                  className="flex-shrink-0 ml-2"
                  style={{ color: colors.primaryText }}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </DropdownMenuItem>
          </div>
        ))}
        <DropdownMenuSeparator style={{ backgroundColor: colors.border }} />
        <DropdownMenuItem onClick={onCreateCourse} className="cursor-pointer" style={{ color: colors.accent }}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Create New Course
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
