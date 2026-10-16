export type GetFramePermissionsResponseBody = {
  canWriteFrameSource: boolean;
  /**
   * Temporary alias of `canWriteFrameSource` for clients that still decode the old field
   * (mobile `FramePermissions`, open web tabs). Remove once those clients ship the rename.
   */
  isFrameAuthor: boolean;
  /** Scoped path of the Frame package root (`conversation-…/MyFrame`), when known. */
  packageRoot: string | null;
  /** Whether the Frame's active publication declares at least one function. */
  hasFunctions: boolean;
};
