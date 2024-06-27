import * as t from "io-ts";

import { ModelId } from "../shared/model_id";
import { MessageType, MessageVisibility } from "./assistant/conversation";

export type ContentFragmentContextType = {
  username: string | null;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

// TODO (26/06/2024 jules): remove "slack_thread_content" and "file_attachment"
// after backfilling data
const supportedTextContentFragmentType = [
  "text/plain",
  "text/csv",
  "text/tsv",
  "text/comma-separated-values",
  "text/tab-separated-values",
  "text/markdown",
  "application/pdf",
  "file_attachment",
] as const;

export type SupportedTextContentFragmentType =
  (typeof supportedTextContentFragmentType)[number];

const supportedImagesContentFragmentType = ["image/jpeg", "image/png"] as const;

export type SupportedImagesContentFragmentType =
  (typeof supportedImagesContentFragmentType)[number];

// Content fragment types that users are allowed to upload.
const supportedUploadableContentFragmentType = [
  ...supportedTextContentFragmentType,
  ...supportedImagesContentFragmentType,
] as const;

export type SupportedUploadableContentFragmentType =
  (typeof supportedUploadableContentFragmentType)[number];

export const supportedContentFragmentType = [
  ...supportedUploadableContentFragmentType,
  "slack_thread_content",
  "dust-application/slack",
] as const;

export type SupportedContentFragmentType =
  (typeof supportedContentFragmentType)[number];

export function getSupportedContentFragmentTypeCodec(): t.Mixed {
  const [first, second, ...rest] = supportedContentFragmentType;
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
}

export type ContentFragmentType = {
  id: ModelId;
  sId: string;
  created: number;
  type: "content_fragment";
  visibility: MessageVisibility;
  version: number;
  sourceUrl: string | null;
  textUrl: string;
  textBytes: number | null;
  title: string;
  contentType: SupportedContentFragmentType;
  context: ContentFragmentContextType;
};

export type UploadedContentFragment = {
  title: string;
  content: string;
  file: File;
  contentType: SupportedContentFragmentType;
};

export function isContentFragmentType(
  arg: MessageType
): arg is ContentFragmentType {
  return arg.type === "content_fragment";
}

export function isSupportedContentFragmentType(
  format: unknown
): format is SupportedContentFragmentType {
  return (
    typeof format === "string" &&
    supportedContentFragmentType.includes(
      format as SupportedContentFragmentType
    )
  );
}

export function isSupportedTextContentFragmentType(
  format: unknown
): format is SupportedTextContentFragmentType {
  return (
    typeof format === "string" &&
    supportedTextContentFragmentType.includes(
      format as SupportedTextContentFragmentType
    )
  );
}

export function isSupportedUploadableContentFragmentType(
  format: string
): format is SupportedUploadableContentFragmentType {
  return supportedUploadableContentFragmentType.includes(
    format as SupportedUploadableContentFragmentType
  );
}

export function isSupportedImageContentFragmentType(format: string) {
  return supportedImagesContentFragmentType.includes(
    format as SupportedImagesContentFragmentType
  );
}
