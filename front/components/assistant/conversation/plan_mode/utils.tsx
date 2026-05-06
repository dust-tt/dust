const TITLE_REGEX = /^#\s+(.+)$/m;
const TASK_LINE_REGEX = /^\s*-\s*\[[ xX!]\]\s*(.+)$/gm;
const TASKS_HEADING_REGEX = /^##\s+Tasks?\s*$/m;

const FALLBACK_TITLE = "Untitled plan";

// Heading stays inside `preamble` so Markdown styles it consistently with
// the other section headings; the task list is rendered separately.
export function parsePlan(content: string | null): {
  title: string;
  preamble: string;
  tasks: string[];
} {
  if (!content) {
    return { title: FALLBACK_TITLE, preamble: "", tasks: [] };
  }

  const titleMatch = content.match(TITLE_REGEX);
  const title = titleMatch ? titleMatch[1].trim() : FALLBACK_TITLE;

  const headingMatch = content.match(TASKS_HEADING_REGEX);
  if (!headingMatch || headingMatch.index === undefined) {
    return { title, preamble: content, tasks: [] };
  }

  const splitIdx = headingMatch.index + headingMatch[0].length;
  const tasks = Array.from(
    content.slice(splitIdx).matchAll(TASK_LINE_REGEX)
  ).map((m) => m[1].trim());

  return { title, preamble: content.slice(0, splitIdx), tasks };
}
