import type {
  DataSourceViewContentNodeType,
  UploadedContentFragmentType,
} from "@dust-tt/client";

export type UploadedFileKind = "attachment" | "tab_content" | "selection";

export type UploadedContentFragmentTypeWithKind =
  UploadedContentFragmentType & {
    kind: UploadedFileKind;
  };

export type UploadedFileWithSupersededContentFragmentId =
  UploadedContentFragmentType & {
    supersededContentFragmentId?: string;
  };

export type ContentFragmentsType = {
  uploaded: UploadedContentFragmentTypeWithKind[];
  contentNodes: DataSourceViewContentNodeType[];
};

/**
 * User data needed to build message context.
 */
export type MessageContextUser = {
  username: string;
  email: string | null;
  fullName: string | null;
  image?: string | null;
  profilePictureUrl?: string | null;
};

/**
 * Message context type matching SDK's PublicPostMessagesRequestBody["context"].
 */
export type MessageContext = {
  timezone: string;
  username: string;
  email: string | null;
  fullName: string | null;
  profilePictureUrl: string | null;
  origin: string;
};

/**
 * Helper to build message context from user data.
 * Used by both browser extension and mobile app.
 */
export function buildMessageContext(
  user: MessageContextUser,
  origin: string
): MessageContext {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    profilePictureUrl: user.profilePictureUrl ?? user.image ?? null,
    origin,
  };
}
