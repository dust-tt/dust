import type { FrameToolCallPair } from "@app/types/api/frame_publication";

export type GetFramePermissionsResponseBody = {
  canWriteFrameSource: boolean;
  /**
   * Temporary alias of `canWriteFrameSource` for clients that still decode the old field
   * (mobile `FramePermissions`, open web tabs). Remove once those clients ship the rename.
   */
  isFrameAuthor: boolean;
  /** Scoped path of the Frame package root (`conversation-…/MyFrame`), when known. */
  packageRoot: string | null;
  /** Display name of the Frame (folder name), when known. */
  frameName: string | null;
  /** Whether the Frame's active publication declares at least one function. */
  hasFunctions: boolean;
  /** Active publication's frame-level tools.call pairs; empty when none or no publication. */
  requiredTools: FrameToolCallPair[];
  /** True when the current user published the active publication. */
  isLastPublisher: boolean;
  /** Full name of the user who published the active publication, when known. */
  lastPublisherName: string | null;
  /**
   * True when the viewer may use the Frame's tools without further consent:
   * no required tools, last publisher, or stored authorization covers requiredTools.
   */
  hasAuthorizedRequiredTools: boolean;
};

export type PostFrameToolAuthorizationResponseBody = {
  authorizedTools: FrameToolCallPair[];
};
