"use client";

import { useState } from "react";
import { SunIcon, MoonIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MainContent } from "@/components/MainContent/MainContent";
import { RightPanel } from "@/components/RightPanel/RightPanel";
import { CreateCourseDialog } from "@/components/Dialogs/CreateCourseDialog";
import { MaterialsDialog } from "@/components/Dialogs/MaterialsDialog";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useResizePanel } from "@/hooks/useResizePanel";
import { useChat } from "@/hooks/useChat";
import { darkModeColors, lightModeColors } from "@/constants/colors";
import type { Course, Material } from "@/types";

export const StudyBuddyClient = () => {
  const { toast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSlidesCollapsed, setIsSlidesCollapsed] = useState(false);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentCourseId, setCurrentCourseId] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [isMaterialsDialogOpen, setIsMaterialsDialogOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const [pageNumber] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const colors = isDarkMode ? darkModeColors : lightModeColors;
  const currentCourse = courses.find((c) => c.id === currentCourseId) ?? courses[0] ?? null;

  const { messages, isLoading, inputValue, setInputValue, sendMessage, deleteCourseHistory } = useChat(currentCourseId);

  const { uploadedFiles, isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleFileSelect, removeFile, clearFiles } = useFileUpload();

  const { panelWidth, isResizing, handleMouseDown } = useResizePanel(400, 800, 400);

  const handleCourseChange = (course: Course) => {
    setCurrentCourseId(course.id);
    setSelectedTopic(course.content[0]?.children[0] || "");
  };

  const handleDeleteCourse = (courseId: string) => {
    const courseToDelete = courses.find(c => c.id === courseId);
    const filteredCourses = courses.filter((c) => c.id !== courseId);
    setCourses(filteredCourses);

    deleteCourseHistory(courseId);

    if (currentCourseId === courseId) {
      if (filteredCourses.length > 0) {
        setCurrentCourseId(filteredCourses[0].id);
        setSelectedTopic(filteredCourses[0].content[0]?.children[0] || "");
      } else {
        setCurrentCourseId("");
        setSelectedTopic("");
      }
    }

    if (courseToDelete) {
      toast({
        title: "Course deleted",
        description: `${courseToDelete.name} and its chat history have been removed.`,
      });
    }
  };

  const handleCreateCourse = () => {
    if (!newCourseName.trim()) return;

    const newCourse: Course = {
      id: `course-${Date.now()}`,
      name: newCourseName.trim(),
      content: [],
    };

    setCourses([...courses, newCourse]);
    setCurrentCourseId(newCourse.id);
    setSelectedTopic("");
    setNewCourseName("");
    setIsCreateCourseOpen(false);

    toast({
      title: "Course created",
      description: `${newCourse.name} has been created successfully`,
    });
  };

  const handleSaveMaterials = () => {
    if (!currentCourse) return;

    try {
      const newMaterials: Material[] = uploadedFiles.map((file) => ({
        id: `material-${Date.now()}-${Math.random()}`,
        name: file.name,
        file: file,
        courseId: currentCourseId,
        type: "pdf" as const,
      }));

      setMaterials([...materials, ...newMaterials]);
      clearFiles();

      toast({
        title: "Upload successful",
        description: `${newMaterials.length} file${newMaterials.length > 1 ? "s" : ""} uploaded to ${currentCourse.name}`,
      });
    } catch {
      toast({
        title: "Upload failed",
        description: "Failed to save materials. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUploadClick = () => {
    document.getElementById("file-upload-input")?.click();
  };

  const getPdfMaterials = () => {
    return materials.filter((m) => m.courseId === currentCourseId && m.type === "pdf");
  };

  const getVideoMaterials = () => {
    return materials.filter((m) => m.courseId === currentCourseId && m.type === "video");
  };

  const handleDeleteMaterial = (materialId: string) => {
    if (!currentCourse) return;
    const material = materials.find((m) => m.id === materialId);
    setMaterials(materials.filter((m) => m.id !== materialId));

    if (material) {
      toast({
        title: "Material deleted",
        description: `${material.name} has been removed from ${currentCourse.name}`,
      });
    }
  };

  const handleMoveMaterial = (materialId: string, targetCourseId: string) => {
    setMaterials(materials.map((m) => (m.id === materialId ? { ...m, courseId: targetCourseId } : m)));
  };

  const getCurrentCourseMaterials = () => {
    return materials.filter((m) => m.courseId === currentCourseId);
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.background }}>
      {currentCourse ? (
        <>
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            setIsCollapsed={setIsSidebarCollapsed}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            courses={courses}
            currentCourse={currentCourse}
            selectedTopic={selectedTopic}
            colors={colors}
            onCourseChange={handleCourseChange}
            onTopicSelect={setSelectedTopic}
            onDeleteCourse={handleDeleteCourse}
            onCreateCourse={() => setIsCreateCourseOpen(true)}
            hoveredCourseId={hoveredCourseId}
            setHoveredCourseId={setHoveredCourseId}
          />

          <MainContent
            colors={colors}
            isDragging={isDragging}
            uploadedFiles={uploadedFiles}
            messages={messages}
            inputValue={inputValue}
            isLoading={isLoading}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onRemoveFile={removeFile}
            onSaveMaterials={handleSaveMaterials}
            onOpenMaterials={() => setIsMaterialsDialogOpen(true)}
            onInputChange={setInputValue}
            onSendMessage={sendMessage}
          />

          <RightPanel
            panelWidth={panelWidth}
            isResizing={isResizing}
            isSlidesCollapsed={isSlidesCollapsed}
            isVideoCollapsed={isVideoCollapsed}
            colors={colors}
            pageNumber={pageNumber}
            isPlaying={isPlaying}
            hasPdfMaterials={getPdfMaterials().length > 0}
            hasVideoMaterials={getVideoMaterials().length > 0}
            onMouseDown={handleMouseDown}
            onToggleSlides={() => setIsSlidesCollapsed(!isSlidesCollapsed)}
            onToggleVideo={() => setIsVideoCollapsed(!isVideoCollapsed)}
            onSetPlaying={setIsPlaying}
            onUploadClick={handleUploadClick}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
            <h2 className="text-lg font-semibold" style={{ color: colors.primaryText }}>
              StudyBuddy
            </h2>
            <button
              className="h-8 w-8 flex items-center justify-center"
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ color: colors.primaryText }}
            >
              {isDarkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </header>
          <EmptyState
            colors={colors}
            onCreateCourse={() => setIsCreateCourseOpen(true)}
          />
        </div>
      )}

      <CreateCourseDialog
        isOpen={isCreateCourseOpen}
        courseName={newCourseName}
        colors={colors}
        onClose={() => {
          setIsCreateCourseOpen(false);
          setNewCourseName("");
        }}
        onCourseNameChange={setNewCourseName}
        onCreate={handleCreateCourse}
      />

      {currentCourse && (
        <MaterialsDialog
          isOpen={isMaterialsDialogOpen}
          materials={getCurrentCourseMaterials()}
          courses={courses}
          currentCourse={currentCourse}
          colors={colors}
          onClose={() => setIsMaterialsDialogOpen(false)}
          onDeleteMaterial={handleDeleteMaterial}
          onMoveMaterial={handleMoveMaterial}
        />
      )}

      <Toaster />
    </div>
  );
};
