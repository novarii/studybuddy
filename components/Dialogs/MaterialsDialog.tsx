"use client";

import React from "react";
import { FileTextIcon, MoveIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Material, Course, ColorScheme } from "@/types";

type MaterialsDialogProps = {
  isOpen: boolean;
  materials: Material[];
  courses: Course[];
  currentCourse: Course;
  colors: ColorScheme;
  onClose: () => void;
  onDeleteMaterial: (materialId: string) => void;
  onMoveMaterial: (materialId: string, targetCourseId: string) => void;
};

export const MaterialsDialog: React.FC<MaterialsDialogProps> = ({
  isOpen,
  materials,
  courses,
  currentCourse,
  colors,
  onClose,
  onDeleteMaterial,
  onMoveMaterial,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: colors.panel, borderColor: colors.border }} className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle style={{ color: colors.primaryText }}>Course Materials</DialogTitle>
          <DialogDescription style={{ color: colors.secondaryText }}>Manage materials for {currentCourse.name}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {materials.length === 0 ? (
            <div className="text-center py-8" style={{ color: colors.secondaryText }}>
              <FileTextIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No materials uploaded for this course yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {materials.filter(m => m.type === "pdf").length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: colors.primaryText }}>
                    Course Materials (PDFs)
                  </h3>
                  <div className="space-y-2">
                    {materials.filter(m => m.type === "pdf").map((material) => (
                      <div key={material.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <FileTextIcon className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent }} />
                        <span className="text-sm flex-1 truncate" style={{ color: colors.primaryText }}>
                          {material.name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" style={{ color: colors.primaryText }}>
                              <MoveIcon className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
                            <DropdownMenuLabel style={{ color: colors.primaryText }}>Move to Course</DropdownMenuLabel>
                            <DropdownMenuSeparator style={{ backgroundColor: colors.border }} />
                            {courses
                              .filter((c) => c.id !== currentCourse.id)
                              .map((course) => (
                                <DropdownMenuItem key={course.id} onClick={() => onMoveMaterial(material.id, course.id)} className="cursor-pointer" style={{ color: colors.primaryText }}>
                                  {course.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button onClick={() => onDeleteMaterial(material.id)} className="flex-shrink-0" style={{ color: colors.primaryText }}>
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {materials.filter(m => m.type === "video").length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: colors.primaryText }}>
                    Lecture Recordings
                  </h3>
                  <div className="space-y-2">
                    {materials.filter(m => m.type === "video").map((material) => (
                      <div key={material.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <FileTextIcon className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent }} />
                        <span className="text-sm flex-1 truncate" style={{ color: colors.primaryText }}>
                          {material.name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" style={{ color: colors.primaryText }}>
                              <MoveIcon className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
                            <DropdownMenuLabel style={{ color: colors.primaryText }}>Move to Course</DropdownMenuLabel>
                            <DropdownMenuSeparator style={{ backgroundColor: colors.border }} />
                            {courses
                              .filter((c) => c.id !== currentCourse.id)
                              .map((course) => (
                                <DropdownMenuItem key={course.id} onClick={() => onMoveMaterial(material.id, course.id)} className="cursor-pointer" style={{ color: colors.primaryText }}>
                                  {course.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button onClick={() => onDeleteMaterial(material.id)} className="flex-shrink-0" style={{ color: colors.primaryText }}>
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} style={{ backgroundColor: colors.accent, color: colors.buttonIcon }}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
