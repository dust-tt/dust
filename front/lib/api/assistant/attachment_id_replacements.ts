import type { CompactionAttachmentIdReplacements } from "@app/types/assistant/compaction";

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
