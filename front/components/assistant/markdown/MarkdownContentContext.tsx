import React from "react";

export const MarkdownContentContext = React.createContext<{
  content: string;
  isStreaming: boolean;
  isLastMessage: boolean;
}>({
  content: "",
  isStreaming: false,
  isLastMessage: false,
});
