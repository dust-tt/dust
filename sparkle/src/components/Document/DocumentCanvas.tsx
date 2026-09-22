import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

interface DocumentCanvasProps {
  themed: boolean;
  children: ReactNode;
}

/** Document themes style the canvas while editor controls keep Sparkle's appearance. */
export const DocumentCanvas = ({ themed, children }: DocumentCanvasProps) => (
  <div
    data-document-canvas=""
    className={cn(
      themed && [
        "bg-[var(--document-background)] text-[var(--document-foreground)]",
        "[&_.tiptap]:font-[family-name:var(--document-font-body)] [&_.tiptap]:text-[length:var(--document-body-size)] [&_.tiptap]:leading-[var(--document-line-height)] [&_.tiptap]:caret-[var(--document-accent)]",
        "[&_.tiptap>p]:my-[var(--document-spacing)] [&_.tiptap>ul]:my-[var(--document-spacing)] [&_.tiptap>ol]:my-[var(--document-spacing)]",
        "[&_.tiptap>h1]:font-[family-name:var(--document-font-heading)] [&_.tiptap>h2]:font-[family-name:var(--document-font-heading)] [&_.tiptap>h3]:font-[family-name:var(--document-font-heading)] [&_.tiptap>h4]:font-[family-name:var(--document-font-heading)] [&_.tiptap>h5]:font-[family-name:var(--document-font-heading)] [&_.tiptap>h6]:font-[family-name:var(--document-font-heading)]",
        "[&_.tiptap>h1]:text-[length:var(--document-h1-size)] [&_.tiptap>h1:first-child]:text-[length:var(--document-h1-size)] [&_.tiptap>h2]:text-[length:var(--document-h2-size)] [&_.tiptap>h3]:text-[length:var(--document-h3-size)] [&_.tiptap>h4]:text-[length:var(--document-h4-size)]",
        "[&_.tiptap>blockquote]:border-[var(--document-accent)] [&_.tiptap>blockquote]:text-[var(--document-muted)] [&_.tiptap>hr]:border-[var(--document-border)]",
        "[&_.tiptap>pre]:border-[var(--document-border)] [&_.tiptap>pre]:bg-[var(--document-surface)] [&_.tiptap>pre]:text-[var(--document-foreground)] [&_.tiptap_a]:text-[var(--document-accent)]",
      ]
    )}
  >
    {children}
  </div>
);
