import { cn } from "@sparkle/lib/utils";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

import { DocumentAnchors } from "./DocumentAnchors";
import {
  createDocumentMarked,
  type DocumentMarked,
  MarkdownSource,
} from "./DocumentMarkdownSource";

const contentExtensions = [
  DocumentAnchors,
  MarkdownSource,
  StarterKit.configure({
    heading: {
      HTMLAttributes: {
        class: cn(
          "text-pretty font-semibold tracking-tight",
          "[&:is(h1)]:heading-3xl [&:is(h1)]:mt-9 [&:is(h1)]:mb-3",
          "[&:is(h2)]:heading-2xl [&:is(h2)]:mt-8 [&:is(h2)]:mb-3",
          "[&:is(h3)]:heading-xl [&:is(h3)]:mt-7 [&:is(h3)]:mb-2"
        ),
      },
    },
    paragraph: { HTMLAttributes: { class: "my-2.5" } },
    bold: { HTMLAttributes: { class: "font-semibold" } },
    bulletList: { HTMLAttributes: { class: "my-3 list-disc pl-6" } },
    orderedList: { HTMLAttributes: { class: "my-3 list-decimal pl-6" } },
    listItem: {
      HTMLAttributes: {
        class:
          "pl-1 marker:text-muted-foreground marker:tabular-nums [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1",
      },
    },
    blockquote: {
      HTMLAttributes: {
        class:
          "my-6 border-l-2 border-foreground/30 px-4 py-0.5 text-foreground/85 [&>p]:my-1",
      },
    },
    codeBlock: {
      HTMLAttributes: {
        class:
          "my-6 overflow-x-auto whitespace-pre rounded-xl border border-border bg-muted-background px-5 py-4 font-mono text-sm leading-relaxed [tab-size:2] [&>code]:font-mono",
      },
    },
    code: {
      HTMLAttributes: {
        class:
          "rounded border border-border bg-muted-background px-1 py-0.5 font-mono text-[0.85em]",
      },
    },
    link: {
      HTMLAttributes: {
        rel: "noopener noreferrer",
        class:
          "underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-current motion-reduce:transition-none",
      },
    },
    horizontalRule: {
      HTMLAttributes: { class: "my-8 border-0 border-t border-border" },
    },
  }),
  Placeholder.configure({
    placeholder: ({ node, pos, editor }) =>
      node.type.name === "heading"
        ? pos === 0
          ? "Untitled"
          : "Heading"
        : node.type.name === "paragraph"
          ? editor.isEmpty
            ? "Start writing, or type / for blocks…"
            : "Type / for blocks…"
          : "",
  }),
];

export const documentMarked: DocumentMarked =
  createDocumentMarked(contentExtensions);

export const documentExtensions = [
  ...contentExtensions,
  Markdown.configure({ marked: documentMarked }),
];
