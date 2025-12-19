"use client";

import React from "react";
import type { Course, ColorScheme } from "@/types";

type ContentsListProps = {
  content: Course["content"];
  selectedTopic: string;
  colors: ColorScheme;
  onTopicSelect: (topic: string) => void;
};

export const ContentsList: React.FC<ContentsListProps> = ({ content, selectedTopic, colors, onTopicSelect }) => {
  return (
    <nav className="p-2">
      {content.map((unit) => (
        <div key={unit.id} className="mb-2">
          <button
            className="w-full text-left px-3 py-2 text-sm font-medium rounded transition-colors"
            onClick={() => onTopicSelect(unit.title)}
            style={{
              color: colors.primaryText,
              backgroundColor: "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {unit.title}
          </button>
          <div className="ml-2 mt-1 space-y-1">
            {unit.children.map((item, itemIndex) => (
              <button
                key={`${unit.id}-${itemIndex}`}
                className="w-full text-left px-3 py-1.5 text-xs rounded transition-colors"
                onClick={() => onTopicSelect(item)}
                style={{
                  color: selectedTopic === item ? colors.selected : colors.secondaryText,
                  fontWeight: selectedTopic === item ? "bold" : "normal",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.hover;
                  e.currentTarget.style.color = colors.primaryText;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = selectedTopic === item ? colors.selected : colors.secondaryText;
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
};
