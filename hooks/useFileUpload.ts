"use client";

import { useState } from "react";
import { useToast } from "./use-toast";

export const useFileUpload = () => {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const validatePdfFiles = (files: File[]): File[] => {
    const pdfFiles = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfFiles.length !== files.length) {
      toast({
        title: "Invalid file type",
        description: "Only PDF files are allowed. Non-PDF files have been filtered out.",
        variant: "destructive",
      });
    }

    return pdfFiles;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFiles = validatePdfFiles(files);
    setUploadedFiles([...uploadedFiles, ...pdfFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = validatePdfFiles(files);
    setUploadedFiles([...uploadedFiles, ...pdfFiles]);
  };

  const removeFile = (index: number) => {
    const file = uploadedFiles[index];
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));

    toast({
      title: "File removed",
      description: `${file.name} removed from upload queue`,
    });
  };

  const clearFiles = () => {
    setUploadedFiles([]);
  };

  return {
    uploadedFiles,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    removeFile,
    clearFiles,
  };
};
