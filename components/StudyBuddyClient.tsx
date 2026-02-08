"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { SunIcon, MoonIcon, LoaderIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MainContent } from "@/components/MainContent/MainContent";
import { RightPanel } from "@/components/RightPanel/RightPanel";
import { CourseSelectDialog } from "@/components/Dialogs/CourseSelectDialog";
import { MaterialsDialog } from "@/components/Dialogs/MaterialsDialog";
import { ConnectApiKeyDialog } from "@/components/Dialogs/ConnectApiKeyDialog";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useCourses } from "@/hooks/useCourses";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { useDocuments } from "@/hooks/useDocuments";
import { useLectures } from "@/hooks/useLectures";
import { useResizePanel } from "@/hooks/useResizePanel";
import { useChat } from "@/hooks/useChat";
import { useChatSessions } from "@/hooks/useChatSessions";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSlidesCollapsed, setIsSlidesCollapsed] = useState(false);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState<string>("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCourseSelectOpen, setIsCourseSelectOpen] = useState(false);
  const [isMaterialsDialogOpen, setIsMaterialsDialogOpen] = useState(false);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [lectureTimestamp, setLectureTimestamp] = useState<number>(0);

  const colors = isDarkMode ? darkModeColors : lightModeColors;

  // Sync .dark class on <html> so Tailwind dark: variants and CSS variables work
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // Use the courses hook for API integration
  const {
    userCourses,
    availableCourses,
    isLoading: isCoursesLoading,
    addCourse,
    removeCourse,
  } = useCourses();

  const currentCourse = userCourses.find((c) => c.id === currentCourseId) ?? userCourses[0] ?? null;

  // Session management
  const {
    sessions,
    isLoading: isSessionsLoading,
    createSession,
    deleteSession,
    generateTitle,
    isNewSession,
    markSessionCreated,
  } = useChatSessions(currentCourseId);

  const {
    messages,
    isLoading: isChatLoading,
    isLoadingHistory,
    sendMessage,
    deleteCourseHistory,
    error: chatError,
    needsApiKey,
    clearApiKeyError,
  } = useChat(currentCourseId, currentSessionId ?? undefined, {
    isNewSession,
    onSessionCreated: markSessionCreated,
  });

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

  const { lectures, refetch: refetchLectures } = useLectures(currentCourseId);

  const { panelWidth: rightPanelWidth, isResizing: isRightPanelResizing, handleMouseDown: handleRightPanelMouseDown } = useResizePanel(400, 800, 400, "right");

  // Refetch documents when uploads complete
  useEffect(() => {
    const hasCompletedUpload = uploads.some((u) => u.status === "success");
    if (hasCompletedUpload) {
      refetchDocuments();
    }
  }, [uploads, refetchDocuments]);

  // Show toast on chat error (except for API key errors which show a dialog)
  useEffect(() => {
    if (chatError && !needsApiKey) {
      toast({
        title: "Chat error",
        description: chatError.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  }, [chatError, needsApiKey, toast]);

  // Handle OAuth callback URL params
  useEffect(() => {
    const apiKeyConnected = searchParams.get("api_key_connected");
    const error = searchParams.get("error");

    if (apiKeyConnected === "true") {
      toast({
        title: "API key connected",
        description: "Your OpenRouter API key has been connected successfully.",
      });
      // Clear URL params
      router.replace("/");
    } else if (error?.startsWith("oauth_")) {
      toast({
        title: "Connection failed",
        description: "Failed to connect OpenRouter API key. Please try again.",
        variant: "destructive",
      });
      router.replace("/");
    }
  }, [searchParams, router, toast]);

  // Auto-select first session when sessions load (conditional setState during render).
  // Verify sessions belong to the current course to avoid selecting stale sessions
  // from the previous course during the render before fetchSessions completes.
  if (!currentSessionId && sessions.length > 0 && sessions[0].course_id === currentCourseId) {
    setCurrentSessionId(sessions[0].session_id);
  }

  // Auto-generate title after first assistant response
  useEffect(() => {
    if (currentSessionId && messages.length === 2) {
      // 2 messages = 1 user + 1 assistant (first exchange complete)
      const session = sessions.find((s) => s.session_id === currentSessionId);
      if (session && !session.session_name) {
        generateTitle(currentSessionId);
      }
    }
  }, [currentSessionId, messages.length, sessions, generateTitle]);

  // Set current course when userCourses loads and no course is selected
  if (!currentCourseId && userCourses.length > 0) {
    setCurrentCourseId(userCourses[0].id);
  }

  const handleCourseChange = (course: Course) => {
    setCurrentCourseId(course.id);
    setCurrentSessionId(null); // Reset session when course changes
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
        setCurrentSessionId(null); // Reset session when course changes
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
      setCurrentSessionId(null); // Reset session when course changes
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

  // Session handlers
  const handleNewChat = async () => {
    const sessionId = await createSession();
    if (sessionId) {
      setCurrentSessionId(sessionId);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const success = await deleteSession(sessionId);
    if (success && currentSessionId === sessionId) {
      // Switch to another session or null
      const remaining = sessions.filter((s) => s.session_id !== sessionId);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].session_id : null);
    }
  };

  // Pending message: queued when user sends with no active session.
  // After session creation + re-render, the useEffect below fires the send.
  const pendingMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingMessageRef.current && currentSessionId) {
      const message = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(message);
    }
  }, [currentSessionId, sendMessage]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (currentSessionId) {
      sendMessage(message);
      return;
    }

    // No session — create one and queue the message for after re-render
    const sessionId = await createSession();
    if (!sessionId) return;
    pendingMessageRef.current = message;
    setCurrentSessionId(sessionId);
  }, [currentSessionId, createSession, sendMessage]);

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
      setSelectedLectureId(source.lecture_id);
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
            sessions={sessions}
            currentSessionId={currentSessionId}
            isSessionsLoading={isSessionsLoading}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={handleDeleteSession}
          />

          <MainContent
            colors={colors}
            isDragging={isDragging}
            uploads={uploads}
            messages={messages}
            isLoading={isChatLoading}
            isLoadingHistory={isLoadingHistory}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onRemoveUpload={removeUpload}
            onClearCompleted={clearCompleted}
            onOpenMaterials={() => { refetchDocuments(); refetchLectures(); setIsMaterialsDialogOpen(true); }}
            onSendMessage={handleSendMessage}
            onCitationClick={handleCitationClick}
          />

          <RightPanel
            panelWidth={rightPanelWidth}
            isResizing={isRightPanelResizing}
            isSlidesCollapsed={isSlidesCollapsed}
            isVideoCollapsed={isVideoCollapsed}
            colors={colors}
            pageNumber={pageNumber}
            hasPdfMaterials={documents.length > 0}
            hasVideoMaterials={lectures.length > 0}
            selectedDocumentId={selectedDocumentId}
            selectedLecture={lectures.find((l) => l.id === selectedLectureId) ?? null}
            lectureTimestamp={lectureTimestamp}
            onMouseDown={handleRightPanelMouseDown}
            onToggleSlides={() => setIsSlidesCollapsed(!isSlidesCollapsed)}
            onToggleVideo={() => setIsVideoCollapsed(!isVideoCollapsed)}
            onUploadClick={handleUploadClick}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: colors.primaryText }}>
              <Image src="/icon.png" alt="" width={24} height={24} />
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
          lectures={lectures}
          currentCourse={currentCourse}
          colors={colors}
          onClose={() => setIsMaterialsDialogOpen(false)}
          onDeleteDocument={handleDeleteDocument}
        />
      )}

      <ConnectApiKeyDialog
        isOpen={needsApiKey}
        colors={colors}
        onClose={clearApiKeyError}
      />

      <Toaster />
    </div>
  );
};
