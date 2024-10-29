import React from "react";

export const MarkdownContentContext = React.createContext<{
  content: string;
  isStreaming: boolean;
  isLastMessage: boolean;
  setIsDarkMode: (v: boolean) => void;
  isDarkMode: boolean;
}>({
  content: "",
  isStreaming: false,
  isLastMessage: false,
  setIsDarkMode: () => {},
  isDarkMode: false,
});
