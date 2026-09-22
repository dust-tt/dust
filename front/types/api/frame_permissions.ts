export type GetFramePermissionsResponseBody = {
  isFrameAuthor: boolean;
  /** Scoped path of the Frame package root (`conversation-…/MyFrame`), when known. */
  packageRoot: string | null;
  /** Whether the Frame's active publication declares at least one function. */
  hasFunctions: boolean;
};
