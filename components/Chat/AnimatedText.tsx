"use client";

import React, { useState, useEffect } from "react";

type AnimatedTextProps = {
  text: string;
  delay?: number;
  onAnimationEnd?: () => void;
};

export const AnimatedText: React.FC<AnimatedTextProps> = ({ text, delay = 20, onAnimationEnd }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setDisplayedText("");
    setCurrentIndex(0);
  }, [text]);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, delay);
      return () => clearTimeout(timeout);
    } else {
      onAnimationEnd?.();
    }
  }, [text, currentIndex, delay, onAnimationEnd]);

  return <>{displayedText}</>;
};
