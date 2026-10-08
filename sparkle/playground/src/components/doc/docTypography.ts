import { cn } from "@dust-tt/sparkle";

// How a document reads — the same layout as Dust's markdown file preview
// (Sparkle's Markdown: markdownSizes.ts, HeadingBlock, ParagraphBlock, List),
// without its panel background. Spacing is padding, as in Sparkle, so blocks
// don't collapse margins.
export const DOC_TYPOGRAPHY = cn(
  "text-base leading-relaxed text-foreground",
  "[&_h1]:heading-2xl [&_h1]:pb-2 [&_h1]:pt-4",
  "[&_h2]:heading-xl [&_h2]:pb-2 [&_h2]:pt-4",
  "[&_h3]:heading-lg [&_h3]:pb-2 [&_h3]:pt-4",
  "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:pb-1.5 [&_h4]:pt-3",
  "[&_p]:whitespace-pre-wrap [&_p]:break-words [&_p]:pb-[10px] [&_p]:pt-2",
  "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pb-2 [&_ul]:pl-6",
  "[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1 [&_ol]:pb-2 [&_ol]:pl-6",
  "[&_li]:break-words [&_li>p]:py-0",
  "[&_strong]:font-semibold",
  "[&_hr]:my-4 [&_hr]:border-b [&_hr]:border-primary-150",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted-background [&_pre]:p-4 [&_pre]:text-sm",
  "[&_code]:rounded [&_code]:bg-muted-background [&_code]:px-1 [&_code]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-highlight-600 [&_a]:underline",
  // The document starts flush with the top padding.
  "[&_.ProseMirror>:first-child]:pt-0"
);

/**
 * The area the document sits in: plain padding, on the panel's background.
 * The right side is a little wider than production's to fit comment markers.
 */
export const DOC_PAGE = "w-full py-6 pl-8 pr-16";
