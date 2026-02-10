"use client";

import React, { useState, useMemo, useDeferredValue } from "react";
import { BookOpenIcon, CheckIcon, LoaderIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ColorScheme, Course } from "@/types";

type CourseSelectDialogProps = {
  isOpen: boolean;
  courses: Course[];
  isLoading: boolean;
  colors: ColorScheme;
  onClose: () => void;
  onSelectCourse: (course: Course) => Promise<boolean>;
};

export const CourseSelectDialog: React.FC<CourseSelectDialogProps> = ({
  isOpen,
  courses,
  isLoading,
  colors,
  onClose,
  onSelectCourse,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue);
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null);

  const filteredCourses = useMemo(() => {
    if (!deferredSearch) return courses;
    const q = deferredSearch.toLowerCase();
    return courses.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.instructor?.toLowerCase().includes(q)
    );
  }, [courses, deferredSearch]);

  const handleSelect = async (course: Course) => {
    setAddingCourseId(course.id);
    const success = await onSelectCourse(course);
    setAddingCourseId(null);
    if (success) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-0 gap-0 max-w-lg"
        style={{ backgroundColor: colors.panel, borderColor: colors.border }}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle style={{ color: colors.primaryText }}>Add Course</DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>
            Search and select a course to add to your study list
          </DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter={false}
          className="rounded-none border-t"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <CommandInput
            placeholder="Search courses by code or title..."
            value={searchValue}
            onValueChange={setSearchValue}
            className="border-0"
            style={{ color: colors.primaryText }}
          />
          <CommandList className="max-h-[300px]">
            {isLoading ? (
              <div className="py-6 text-center">
                <LoaderIcon className="w-6 h-6 mx-auto animate-spin" style={{ color: colors.accent }} />
                <p className="text-sm mt-2" style={{ color: colors.secondaryText }}>
                  Loading courses...
                </p>
              </div>
            ) : (
              <>
                {filteredCourses.length === 0 && (
                  <div className="py-6 text-center">
                    <BookOpenIcon className="w-8 h-8 mx-auto mb-2" style={{ color: colors.secondaryText }} />
                    <p className="text-sm" style={{ color: colors.secondaryText }}>
                      No courses found
                    </p>
                  </div>
                )}
                <CommandGroup>
                  {filteredCourses.map((course) => (
                    <CommandItem
                      key={course.id}
                      value={`${course.code} ${course.title}`}
                      onSelect={() => handleSelect(course)}
                      className="cursor-pointer py-3 px-3"
                      style={{
                        color: colors.primaryText,
                      }}
                      disabled={addingCourseId === course.id}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: colors.card }}
                        >
                          {addingCourseId === course.id ? (
                            <LoaderIcon className="w-5 h-5 animate-spin" style={{ color: colors.accent }} />
                          ) : (
                            <BookOpenIcon className="w-5 h-5" style={{ color: colors.accent }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" style={{ color: colors.primaryText }}>
                            {course.code}
                          </p>
                          <p className="text-sm truncate" style={{ color: colors.secondaryText }}>
                            {course.title}
                          </p>
                          {course.instructor && (
                            <p className="text-xs truncate" style={{ color: colors.secondaryText }}>
                              {course.instructor}
                            </p>
                          )}
                        </div>
                        <CheckIcon
                          className="w-5 h-5 opacity-0 group-data-[selected=true]:opacity-100 flex-shrink-0"
                          style={{ color: colors.accent }}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
