import { DocumentAnchors } from "@app/components/editor/document/DocumentAnchors";
import { DocumentCommentAnchor } from "@app/components/editor/document/DocumentCommentAnchor";
import {
  DocumentCommentMark,
  DocumentComments,
} from "@app/components/editor/document/DocumentComments";
import { DocumentFilePreview } from "@app/components/editor/document/DocumentFilePreview";
import { DocumentFrame } from "@app/components/editor/document/DocumentFrame";
import type { DocumentImageOptions } from "@app/components/editor/document/DocumentImage";
import { DocumentImage } from "@app/components/editor/document/DocumentImage";
import { cn } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AnyExtension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { StarterKitOptions } from "@tiptap/starter-kit";
import { StarterKit } from "@tiptap/starter-kit";

export type Translate = (descriptor: MessageDescriptor) => string;

/**
 * @cc [owner:tdraier,label:product] document-link-click
 * In an editable document, clicking a link MUST NOT open it, so its text can be clicked and
 * selected like any other text.
 */
const starterKitOptions: Partial<StarterKitOptions> = {
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
    openOnClick: false,
    HTMLAttributes: {
      rel: "noopener noreferrer",
      class:
        "underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-current motion-reduce:transition-none",
    },
  },
  horizontalRule: {
    HTMLAttributes: { class: "my-8 border-0 border-t border-border" },
  },
};

/** The schema; a live document protects comment marks without a thread and drops StarterKit's undo. */
const buildSchemaExtensions = ({
  live,
  resolveImageSource,
}: {
  live: boolean;
  resolveImageSource?: DocumentImageOptions["resolveSource"];
}): AnyExtension[] => [
  DocumentAnchors,
  DocumentComments,
  live
    ? DocumentCommentMark.configure({ holdsThreads: false })
    : DocumentCommentMark,
  DocumentCommentAnchor,
  resolveImageSource
    ? DocumentImage.configure({ resolveSource: resolveImageSource })
    : DocumentImage,
  DocumentFilePreview,
  DocumentFrame,
  StarterKit.configure(
    live ? { ...starterKitOptions, undoRedo: false } : starterKitOptions
  ),
  Markdown,
];

export const documentExtensions = buildSchemaExtensions({ live: false });

/**
 * The editor's extensions. A live document drops StarterKit's undo history for the
 * collaboration one, and protects comment marks whose thread its editor does not hold.
 */
export const buildDocumentEditorExtensions = (
  t: Translate,
  {
    live = false,
    resolveImageSource,
  }: {
    live?: boolean;
    resolveImageSource: DocumentImageOptions["resolveSource"];
  }
): AnyExtension[] => [
  ...buildSchemaExtensions({ live, resolveImageSource }),
  Placeholder.configure({
    placeholder: ({ node, pos, editor }) =>
      node.type.name === "heading"
        ? pos === 0
          ? t(msg`Untitled`)
          : t(msg`Heading`)
        : node.type.name === "paragraph"
          ? editor.isEmpty
            ? t(msg`Start writing, or type / for elements…`)
            : t(msg`Type / for elements…`)
          : "",
  }),
];
