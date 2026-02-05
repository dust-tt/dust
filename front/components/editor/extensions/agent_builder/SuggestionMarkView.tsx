import type { MarkViewRendererProps } from "@tiptap/react";

export default function SuggestionMarkView(props: MarkViewRendererProps) {
  const { oldString, newString, suggestionId } = props.mark.attrs;

  const idSuffix = suggestionId?.slice(-4) || "";

  return (
    <span className="group inline" data-suggestion-id={suggestionId}>
      <span className="suggestion-deletion rounded px-0.5 line-through bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 group-hover:bg-red-200 group-hover:dark:bg-red-800 [.suggestion-selected_&]:bg-red-200 [.suggestion-selected_&]:dark:bg-red-800 transition-colors">
        {oldString}
        <sup className="text-[0.6em] opacity-60">{idSuffix}</sup>
      </span>
      <span className="suggestion-addition rounded px-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 group-hover:bg-blue-200 group-hover:dark:bg-blue-800 [.suggestion-selected_&]:bg-blue-200 [.suggestion-selected_&]:dark:bg-blue-800 transition-colors">
        {newString}
        <sup className="text-[0.6em] opacity-60">{idSuffix}</sup>
      </span>
    </span>
  );
}
