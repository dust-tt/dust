import type {
  ConversationFileType,
  ConversationType,
  SupportedContentFragmentType,
} from "@dust-tt/types";
import {
  assertNever,
  isAgentMessageType,
  isContentFragmentType,
  isSupportedImageContentType,
} from "@dust-tt/types";

function isConversationIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  // For now we only allow including text files.
  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/markdown":
    case "text/plain":
    case "dust-application/slack":
    case "text/vnd.dust.attachment.slack.thread":
    case "text/comma-separated-values":
    case "text/csv":
      return true;

    case "text/tab-separated-values":
    case "text/tsv":
      return false;
    default:
      assertNever(contentType);
  }
}

function isQueryableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  // For now we only allow including text files.
  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/markdown":
    case "text/plain":
    case "dust-application/slack":
    case "text/vnd.dust.attachment.slack.thread":
    case "text/tab-separated-values":
    case "text/tsv":
      return false;

    case "text/comma-separated-values":
    case "text/csv":
      return true;
    default:
      assertNever(contentType);
  }
}

function isSearchableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  // For now we only allow including text files.
  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/markdown":
    case "text/plain":
    case "dust-application/slack":
    case "text/vnd.dust.attachment.slack.thread":
    case "text/tab-separated-values":
    case "text/tsv":
      return true;

    case "text/comma-separated-values":
    case "text/csv":
      return false;
    default:
      assertNever(contentType);
  }
}

function isListableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // We allow listing all content-types that are not images. Note that
  // `isSupportedPlainTextContentType` is not enough because it is limited to uploadable (as in from
  // the conversation) content types which does not cover all non image content types that we
  // support in the API such as `dust-application/slack`.
  return !isSupportedImageContentType(contentType);
}

// Moved to a separate file to avoid circular dependency issue.
export function listFiles(
  conversation: ConversationType
): ConversationFileType[] {
  const files: ConversationFileType[] = [];
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (
      isContentFragmentType(m) &&
      isListableContentType(m.contentType) &&
      m.contentFragmentVersion === "latest"
    ) {
      if (m.fileId) {
        const canDoJIT = m.snippet !== null;
        const isIncludable = isConversationIncludableFileContentType(
          m.contentType
        );
        const isQueryable = canDoJIT && isQueryableContentType(m.contentType);
        const isSearchable = canDoJIT && isSearchableContentType(m.contentType);

        files.push({
          fileId: m.fileId,
          title: m.title,
          contentType: m.contentType,
          snippet: m.snippet,
          contentFragmentVersion: m.contentFragmentVersion,
          isIncludable,
          isQueryable,
          isSearchable,
        });
      }
    } else if (isAgentMessageType(m)) {
      const generatedFiles = m.actions.flatMap((a) => a.getGeneratedFiles());

      for (const f of generatedFiles) {
        const canDoJIT = f.snippet != null;
        const isIncludable = isConversationIncludableFileContentType(
          f.contentType
        );
        const isQueryable = canDoJIT && isQueryableContentType(f.contentType);
        const isSearchable = canDoJIT && isSearchableContentType(f.contentType);

        files.push({
          fileId: f.fileId,
          contentType: f.contentType,
          title: f.title,
          snippet: f.snippet,
          contentFragmentVersion: "latest",
          isIncludable,
          isQueryable,
          isSearchable,
        });
      }
    }
  }

  return files;
}