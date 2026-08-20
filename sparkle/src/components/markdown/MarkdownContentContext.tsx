import React from "react";

/**
 * Provides renderer blocks with the raw Markdown source (`content`) and
 * message-level flags (`isStreaming`, `isLastMessage`), so blocks can extract
 * original text (e.g. blockquote copy) or adapt to streaming.
 * @summary Context exposing Markdown source and streaming flags.
 */
export const MarkdownContentContext = React.createContext<{
  content: string;
  isStreaming: boolean;
  isLastMessage: boolean;
}>({
  content: "",
  isStreaming: false,
  isLastMessage: false,
});
