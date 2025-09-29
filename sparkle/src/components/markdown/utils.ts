import { MarkdownNode } from "./types";

export function sanitizeContent(str: string): string {
  // (1) Add closing backticks if they are missing such that we render a code block or inline
  // element during streaming.

  // Regular expression to find either a single backtick or triple backticks
  const regex = /(`{1,3})/g;
  let singleBackticks = 0;
  let tripleBackticks = 0;

  // Search for all backticks in the string and update counts
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match[1] === "```") {
      tripleBackticks++;
    } else if (match[1] === "`") {
      singleBackticks++;
    }
  }
  // Append closing backticks if needed
  if (tripleBackticks % 2 !== 0) {
    if (str.endsWith("`")) {
      str += "``";
    } else if (str.endsWith("``")) {
      str += "`";
    } else {
      str += str.includes("\n") ? "\n```" : "```";
    }
  } else if (singleBackticks % 2 !== 0) {
    str += "`";
  }

  return str;
}

export function detectLanguage(children: React.ReactNode) {
  if (Array.isArray(children) && children[0]) {
    return children[0].props.className?.replace("language-", "") || "text";
  }

  return "text";
}

export function sameNodePosition(
  prev?: MarkdownNode,
  next?: MarkdownNode
): boolean {
  if (!(prev?.position || next?.position)) {
    return true;
  }
  if (!(prev?.position && next?.position)) {
    return false;
  }

  const prevStart = prev.position.start;
  const nextStart = next.position.start;
  const prevEnd = prev.position.end;
  const nextEnd = next.position.end;

  return (
    prevStart?.line === nextStart?.line &&
    prevStart?.column === nextStart?.column &&
    prevEnd?.line === nextEnd?.line &&
    prevEnd?.column === nextEnd?.column
  );
}

export function sameTextStyling(
  prevProps: { textColor?: string; textSize?: string },
  nextProps: { textColor?: string; textSize?: string }
): boolean {
  return (
    prevProps.textColor === nextProps.textColor &&
    prevProps.textSize === nextProps.textSize
  );
}
