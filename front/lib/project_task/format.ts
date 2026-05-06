/**
 * Serialization and parsing for project task references in plain text / markdown.
 *
 * Canonical format: `:project_task[label]{sId=projectTaskSid}`
 * Legacy `:todo[...]` is still parsed for backwards compatibility with existing content.
 */

export const PROJECT_TASK_DIRECTIVE_REGEX =
  /(?::project_task|:todo)\[([^\]]+)]\{sId=([^}]+?)}/g;

export const PROJECT_TASK_DIRECTIVE_REGEX_BEGINNING = new RegExp(
  "^" + PROJECT_TASK_DIRECTIVE_REGEX.source,
  PROJECT_TASK_DIRECTIVE_REGEX.flags
);

export function serializeProjectTaskDirective(mention: {
  label: string;
  sId: string;
}): string {
  return `:project_task[${mention.label}]{sId=${mention.sId}}`;
}

export function extractProjectTaskDirectivesFromString(
  content: string
): { label: string; sId: string }[] {
  return [...content.matchAll(PROJECT_TASK_DIRECTIVE_REGEX)].map((match) => ({
    label: match[1],
    sId: match[2],
  }));
}
