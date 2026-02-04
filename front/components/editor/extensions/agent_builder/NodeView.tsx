// SuggestionMarkView.tsx
import type { MarkViewRendererProps } from "@tiptap/react";
import React from "react";

export default function SuggestionMarkView(props: MarkViewRendererProps) {
  const { oldString, newString } = props.mark.attrs;

  return (
    <>
      <span className="suggestion-deletion rounded px-0.5 line-through bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200">
        {oldString}
      </span>
      <span className="suggestion-addition rounded px-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
        {newString}
      </span>
    </>
  );
}