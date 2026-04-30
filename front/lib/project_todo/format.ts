/**
 * Serialization and parsing for project todo references in plain text / markdown.
 *
 * Format: `:todo[label]{sId=projectTodoSid}`
 */

export const PROJECT_TODO_DIRECTIVE_REGEX = /:todo\[([^\]]+)]\{sId=([^}]+?)}/g;

export const PROJECT_TODO_DIRECTIVE_REGEX_BEGINNING = new RegExp(
  "^" + PROJECT_TODO_DIRECTIVE_REGEX.source,
  PROJECT_TODO_DIRECTIVE_REGEX.flags
);

export function serializeProjectTodoDirective(mention: {
  label: string;
  sId: string;
}): string {
  return `:todo[${mention.label}]{sId=${mention.sId}}`;
}

export function extractProjectTodoDirectivesFromString(
  content: string
): { label: string; sId: string }[] {
  return [...content.matchAll(PROJECT_TODO_DIRECTIVE_REGEX)].map((match) => ({
    label: match[1],
    sId: match[2],
  }));
}
