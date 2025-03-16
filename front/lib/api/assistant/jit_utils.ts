import type { ConversationFileType } from "@app/lib/actions/conversation/list_files";
import type {
  ConversationType,
  SupportedContentFragmentType,
} from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@app/types";

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
      if (m.fileId || m.nodeId) {
        const canDoJIT = m.snippet !== null || !!m.nodeId;
        const isIncludable = isConversationIncludableFileContentType(
          m.contentType
        );
        // TODO(attach-ds) remove the m.fileId check once we manage table queries
        const isQueryable =
          canDoJIT && !!m.fileId && isQueryableContentType(m.contentType);
        const isSearchable = canDoJIT && isSearchableContentType(m.contentType);

        files.push({
          contentFragmentId: m.contentFragmentId,
          title: m.title,
          contentType: m.contentType,
          snippet: m.snippet,
          // Backward compatibility: we fallback to the fileId if no generated tables are mentionned but the file is queryable.
          generatedTables:
            m.generatedTables.length > 0
              ? m.generatedTables
              : // TODO(attach-ds) remove the m.fileId check once we manage table queries
                isQueryable && m.fileId
                ? [m.fileId]
                : [],
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
          contentFragmentId: f.fileId,
          contentType: f.contentType,
          title: f.title,
          snippet: f.snippet,
          // For simplicity later, we always set the generatedTables to the fileId if the file is queryable for agent generated files.
          generatedTables: isQueryable ? [f.fileId] : [],
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
