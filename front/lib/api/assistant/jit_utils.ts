import type {
  ConversationFileType,
  ConversationType,
  SupportedContentFragmentType,
} from "@dust-tt/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@dust-tt/types";

function isConversationIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // We allow including everything except images.
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  return true;
}

function isQueryableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // For now we only allow querying tabular files.
  if (isSupportedDelimitedTextContentType(contentType)) {
    return true;
  }
  return false;
}

function isSearchableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  if (isSupportedDelimitedTextContentType(contentType)) {
    return false;
  }
  // For now we allow searching everything else.
  return true;
}

function isListableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // We allow listing all content-types that are not images.
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
