type MarkdownPoint = { line?: number; column?: number };
type MarkdownPosition = { start?: MarkdownPoint; end?: MarkdownPoint };
export type MarkdownNode = {
  position?: MarkdownPosition;
};
