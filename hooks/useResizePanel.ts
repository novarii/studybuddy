"use client";

import { useState, useEffect } from "react";

type PanelSide = "left" | "right";

export const useResizePanel = (
  minWidth: number,
  maxWidth: number,
  initialWidth: number,
  side: PanelSide = "right"
) => {
  const [panelWidth, setPanelWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = side === "right"
        ? window.innerWidth - e.clientX
        : e.clientX;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, side]);

  return {
    panelWidth,
    isResizing,
    handleMouseDown,
  };
};
