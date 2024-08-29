import * as t from "io-ts";

import { ModelId } from "../shared/model_id";
import { MessageType, MessageVisibility } from "./assistant/conversation";
import {
  ImageContentType,
  PlainTextContentType,
  SupportedFileContentType,
  supportedImageContentTypes,
  supportedPlainTextContentTypes,
  supportedUploadableContentType,
} from "./files";

export type ContentFragmentContextType = {
  username: string | null;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export const supportedContentFragmentType = [
  ...supportedUploadableContentType,
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
  fileId: string | null;
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
  fileId: string;
  title: string;
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
): format is PlainTextContentType {
  return (
    typeof format === "string" &&
    supportedPlainTextContentTypes.includes(format as PlainTextContentType)
  );
}

export function isSupportedUploadableContentFragmentType(
  format: string
): format is SupportedFileContentType {
  return supportedUploadableContentType.includes(
    format as SupportedFileContentType
  );
}

export function isSupportedImageContentFragmentType(format: string) {
  return supportedImageContentTypes.includes(format as ImageContentType);
}
