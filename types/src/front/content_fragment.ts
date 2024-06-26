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
export const supportedTextContentFragment = [
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
  (typeof supportedTextContentFragment)[number];

export const supportedContentFragment = [
  ...supportedTextContentFragment,
  "slack_thread_content",
  "dust-application/slack",
] as const;

export type SupportedContentFragmentType =
  (typeof supportedContentFragment)[number];

export function getSupportedContentFragmentTypeCodec(): t.Mixed {
  const [first, second, ...rest] = supportedContentFragment;
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
    supportedContentFragment.includes(format as SupportedContentFragmentType)
  );
}

export function isSupportedTextContentFragmentType(
  format: unknown
): format is SupportedTextContentFragmentType {
  return (
    typeof format === "string" &&
    supportedTextContentFragment.includes(
      format as SupportedTextContentFragmentType
    )
  );
}
