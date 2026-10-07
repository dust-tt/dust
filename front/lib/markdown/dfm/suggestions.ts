import {
  checkInputBounds,
  topLevelCodeBlocks,
} from "@app/lib/markdown/dfm/parser";
import type { DfmError } from "@app/lib/markdown/dfm/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * A suggested change rides in a message body as a fenced code block whose info string is
 * `suggestion`, as on GitHub: its content replaces the commented text when applied. Code
 * fences already keep their lines out of the annotations grammar, so a suggestion needs no
 * directive of its own and signs like any other body.
 */

const SUGGESTION_LANGUAGE = "suggestion";
const BACKTICK_RUN_PATTERN = /`+/g;

export type DfmMessagePart =
  | { kind: "text"; text: string }
  | { kind: "suggestion"; suggestion: string };

/**
 * @cc [owner:tdraier,label:product] dfm-message-suggestions
 * Every top-level fenced code block whose language is `suggestion` MUST be read as a suggestion,
 * its content as CommonMark reads it, and the body as its text and suggestions in order, each
 * text trimmed and none empty. A body without one MUST read as having no suggestion.
 */
export function readMessageSuggestions(
  body: string
): Result<DfmMessagePart[] | null, DfmError> {
  const outOfBounds = checkInputBounds(body);
  if (outOfBounds) {
    return new Err(outOfBounds);
  }
  const blocks = topLevelCodeBlocks(body, SUGGESTION_LANGUAGE);
  if (blocks.length === 0) {
    return new Ok(null);
  }
  const parts: DfmMessagePart[] = [];
  const pushText = (text: string) => {
    if (text.trim()) {
      parts.push({ kind: "text", text: text.trim() });
    }
  };
  let offset = 0;
  for (const block of blocks) {
    pushText(body.slice(offset, block.start));
    parts.push({ kind: "suggestion", suggestion: block.value });
    offset = block.end;
  }
  pushText(body.slice(offset));
  return new Ok(parts);
}

/**
 * @cc [owner:tdraier,label:product] dfm-suggestion-block
 * The block MUST read back through `readMessageSuggestions` as `suggestion`, whatever backticks
 * or line endings it contains, up to CommonMark reading NUL as U+FFFD. A block outside the
 * parser's input bounds MUST be refused with the located bounds error instead.
 */
export function suggestionBlock(suggestion: string): Result<string, DfmError> {
  let longestRun = 0;
  for (const run of suggestion.match(BACKTICK_RUN_PATTERN) ?? []) {
    longestRun = Math.max(longestRun, run.length);
  }
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  // A final CR followed by LF would read as one line ending and drop the CR.
  const lineEnding = suggestion.endsWith("\r") ? "\r" : "\n";
  const block =
    suggestion === ""
      ? `${fence}${SUGGESTION_LANGUAGE}\n${fence}`
      : `${fence}${SUGGESTION_LANGUAGE}\n${suggestion}${lineEnding}${fence}`;
  const outOfBounds = checkInputBounds(block);
  return outOfBounds ? new Err(outOfBounds) : new Ok(block);
}
