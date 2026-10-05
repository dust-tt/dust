/** The preview shows and edits at most this many characters of a text file. */
export const MAX_TEXT_CHARS = 100_000;

/** Shown when a Markdown editor refuses to save text that was cut at MAX_TEXT_CHARS. */
export const CUT_TEXT_SAVE_REFUSED = {
  title: "File too long to save here",
  description:
    "It grew too long to edit here. Copy your changes, then reopen the file.",
};
