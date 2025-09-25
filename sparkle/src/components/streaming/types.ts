import type React from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

export interface StreamingMarkdownProps {
  content: string;
  animationName?: string;
  animationDuration?: string;
  animationTimingFunction?: string;
  animationCurve?: "linear" | "accelerate" | "accelerate-fast" | "custom";
  animationSteps?: Array<{ percent: number; opacity: number }>;
  codeStyle?: React.CSSProperties;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  textColor?: string;
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
}

export interface DirectiveNode {
  type: string;
  name?: string;
  value?: string;
  children?: Array<{ value?: string }>;
}

export interface MarkdownNode {
  position?: {
    start?: {
      line: number;
      column: number;
    };
  };
}

export interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

export type ComponentProps = {
  node?: MarkdownNode;
  children?: React.ReactNode;
  [key: string]: unknown;
};

export interface BlockStreamerProps {
  text: string;
  animate?: boolean;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
}

export interface ProcessChildrenContext {
  isStreaming: boolean;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
}

export const MARKDOWN_TEXT_SIZES = {
  p: "s-copy-sm @sm:s-text-base @sm:s-leading-7",
  h1: "s-heading-2xl",
  h2: "s-heading-xl",
  h3: "s-heading-lg",
  h4: "s-text-base s-font-semibold",
  h5: "s-text-sm s-font-semibold",
  h6: "s-text-sm s-font-regular s-italic",
} as const;