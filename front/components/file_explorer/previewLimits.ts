/** Files larger than this, by their listed size, are not fetched for preview at all. */
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

/**
 * Of a fetched text file, the preview renders and the plain editors edit at most this many
 * characters; rendering more is too slow.
 */
export const MAX_TEXT_CHARS = 100_000;

/** Shown when a Markdown editor refuses to save text that was cut at MAX_TEXT_CHARS. */
export const CUT_TEXT_SAVE_REFUSED = {
  title: "File too long to save here",
  description:
    "It grew too long to edit here. Copy your changes, then reopen the file.",
};
