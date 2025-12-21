"use client";

import { useState, useEffect, useCallback } from "react";
import { SunIcon, MoonIcon, LoaderIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MainContent } from "@/components/MainContent/MainContent";
import { RightPanel } from "@/components/RightPanel/RightPanel";
import { CourseSelectDialog } from "@/components/Dialogs/CourseSelectDialog";
import { MaterialsDialog } from "@/components/Dialogs/MaterialsDialog";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useCourses } from "@/hooks/useCourses";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { useDocuments } from "@/hooks/useDocuments";
import { useResizePanel } from "@/hooks/useResizePanel";
import { useChat } from "@/hooks/useChat";
import { darkModeColors, lightModeColors } from "@/constants/colors";
import type { Course, RAGSource } from "@/types";

// Helper function to format time
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const StudyBuddyClient = () => {
  const { toast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSlidesCollapsed, setIsSlidesCollapsed] = useState(false);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState<string>("");
  const [isCourseSelectOpen, setIsCourseSelectOpen] = useState(false);
  const [isMaterialsDialogOpen, setIsMaterialsDialogOpen] = useState(false);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  // TODO: Wire these to RightPanel when document/lecture viewer integration is complete
  const [, setSelectedDocumentId] = useState<string | null>(null);
  const [, setLectureTimestamp] = useState<number>(0);

  const colors = isDarkMode ? darkModeColors : lightModeColors;

  // Use the courses hook for API integration
  const {
    userCourses,
    availableCourses,
    isLoading: isCoursesLoading,
    addCourse,
    removeCourse,
  } = useCourses();

  const currentCourse = userCourses.find((c) => c.id === currentCourseId) ?? userCourses[0] ?? null;

  const { messages, isLoading: isChatLoading, inputValue, setInputValue, sendMessage, deleteCourseHistory, error: chatError } = useChat(currentCourseId);

  const {
    uploads,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    removeUpload,
    clearCompleted,
  } = useDocumentUpload(currentCourseId);

  const { documents, refetch: refetchDocuments, deleteDocument } = useDocuments(currentCourseId);

  const { panelWidth, isResizing, handleMouseDown } = useResizePanel(400, 800, 400);

  // Refetch documents when uploads complete
  useEffect(() => {
    const hasCompletedUpload = uploads.some((u) => u.status === "success");
    if (hasCompletedUpload) {
      refetchDocuments();
    }
  }, [uploads, refetchDocuments]);

  // Show toast on chat error
  useEffect(() => {
    if (chatError) {
      toast({
        title: "Chat error",
        description: chatError.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  }, [chatError, toast]);

  // Set current course when userCourses loads and no course is selected
  if (!currentCourseId && userCourses.length > 0) {
    setCurrentCourseId(userCourses[0].id);
  }

  const handleCourseChange = (course: Course) => {
    setCurrentCourseId(course.id);
  };

  const handleDeleteCourse = async (courseId: string) => {
    const courseToDelete = userCourses.find((c) => c.id === courseId);
    const success = await removeCourse(courseId);

    if (success) {
      deleteCourseHistory(courseId);

      if (currentCourseId === courseId) {
        const remaining = userCourses.filter((c) => c.id !== courseId);
        if (remaining.length > 0) {
          setCurrentCourseId(remaining[0].id);
        } else {
          setCurrentCourseId("");
        }
      }

      if (courseToDelete) {
        toast({
          title: "Course removed",
          description: `${courseToDelete.code} has been removed from your list.`,
        });
      }
    }
  };

  const handleAddCourse = async (course: Course) => {
    const success = await addCourse(course);
    if (success) {
      setCurrentCourseId(course.id);
      toast({
        title: "Course added",
        description: `${course.code} - ${course.title} has been added to your list.`,
      });
    }
    return success;
  };

  const handleUploadClick = () => {
    document.getElementById("file-upload-input")?.click();
  };

  const handleCitationClick = useCallback((source: RAGSource) => {
    if (source.source_type === "slide" && source.document_id && source.slide_number) {
      // Navigate to the specific slide
      setSelectedDocumentId(source.document_id);
      setPageNumber(source.slide_number);
      setIsSlidesCollapsed(false); // Expand slides panel
      toast({
        title: "Navigating to source",
        description: `${source.title || "Document"} - Slide ${source.slide_number}`,
      });
    } else if (source.source_type === "lecture" && source.lecture_id && source.start_seconds !== undefined) {
      // Navigate to the specific timestamp in the lecture
      setLectureTimestamp(source.start_seconds);
      setIsVideoCollapsed(false); // Expand video panel
      toast({
        title: "Navigating to source",
        description: `${source.title || "Lecture"} @ ${formatTime(source.start_seconds)}`,
      });
    }
  }, [toast]);

  const handleDeleteDocument = async (documentId: string) => {
    if (!currentCourse) return;
    const doc = documents.find((d) => d.id === documentId);
    const success = await deleteDocument(documentId);
    if (success && doc) {
      toast({
        title: "Document deleted",
        description: `${doc.filename} has been removed from ${currentCourse.code}`,
      });
    }
  };

  // Show loading state while courses are loading
  if (isCoursesLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: colors.background }}>
        <div className="flex flex-col items-center gap-4">
          <LoaderIcon className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
          <p style={{ color: colors.secondaryText }}>Loading courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.background }}>
      {currentCourse ? (
        <>
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            setIsCollapsed={setIsSidebarCollapsed}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            courses={userCourses}
            currentCourse={currentCourse}
            colors={colors}
            onCourseChange={handleCourseChange}
            onDeleteCourse={handleDeleteCourse}
            onAddCourse={() => setIsCourseSelectOpen(true)}
            hoveredCourseId={hoveredCourseId}
            setHoveredCourseId={setHoveredCourseId}
          />

          <MainContent
            colors={colors}
            isDragging={isDragging}
            uploads={uploads}
            messages={messages}
            inputValue={inputValue}
            isLoading={isChatLoading}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onRemoveUpload={removeUpload}
            onClearCompleted={clearCompleted}
            onOpenMaterials={() => setIsMaterialsDialogOpen(true)}
            onInputChange={setInputValue}
            onSendMessage={sendMessage}
            onCitationClick={handleCitationClick}
          />

          <RightPanel
            panelWidth={panelWidth}
            isResizing={isResizing}
            isSlidesCollapsed={isSlidesCollapsed}
            isVideoCollapsed={isVideoCollapsed}
            colors={colors}
            pageNumber={pageNumber}
            isPlaying={isPlaying}
            hasPdfMaterials={documents.length > 0}
            hasVideoMaterials={false}
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
            onAddCourse={() => setIsCourseSelectOpen(true)}
          />
        </div>
      )}

      <CourseSelectDialog
        isOpen={isCourseSelectOpen}
        courses={availableCourses}
        isLoading={isCoursesLoading}
        colors={colors}
        onClose={() => setIsCourseSelectOpen(false)}
        onSelectCourse={handleAddCourse}
      />

      {currentCourse && (
        <MaterialsDialog
          isOpen={isMaterialsDialogOpen}
          documents={documents}
          currentCourse={currentCourse}
          colors={colors}
          onClose={() => setIsMaterialsDialogOpen(false)}
          onDeleteDocument={handleDeleteDocument}
        />
      )}

      <Toaster />
    </div>
  );
};
