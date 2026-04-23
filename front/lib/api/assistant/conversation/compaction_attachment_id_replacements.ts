import type { CompactionAttachmentIdReplacements } from "@app/types/assistant/compaction";

/**
 * Source-backed compaction is reused when creating conversation forks.
 *
 * In that flow we need to rewrite attachment ids from the source conversation to the ids that
 * exist in the child conversation, both in the persisted compaction summary and in copied
 * interactive-content files that embed those ids.
 *
 * The replacement is intentionally limited to standalone id tokens so surrounding prose and
 * concatenated strings remain unchanged.
 */
export function replaceStandaloneAttachmentIds(
  content: string,
  replacements: CompactionAttachmentIdReplacements | undefined
): string {
  if (!replacements || Object.keys(replacements).length === 0) {
    return content;
  }

  let nextContent = content;

  for (const [sourceId, targetId] of Object.entries(replacements).sort(
    ([leftId], [rightId]) => rightId.length - leftId.length
  )) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegex(sourceId)})(?=$|[^A-Za-z0-9_])`,
      "g"
    );

    nextContent = nextContent.replace(pattern, (_match, prefix) => {
      return `${prefix}${targetId}`;
    });
  }

  return nextContent;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
