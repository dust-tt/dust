import { diffLines } from "diff";
import * as _ from "lodash";

export function applyUnifiedDiff(
  original: string,
  unifiedDiff: string
): string {
  // Normalize line endings and split
  const diffText = unifiedDiff.replace(/\r\n/g, "\n");
  const lines = diffText.split("\n");
  if (!diffText.endsWith("\n")) lines.push("");

  const hunks: string[] = [];
  let currentHunkLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      inHunk = true;

      if (currentHunkLines.length) {
        // Commit the current hunk
        hunks.push(currentHunkLines.join("\n"));
      }

      currentHunkLines = [];
    } else if (line.startsWith("---") || line.startsWith("+++")) {
      // Ignore file headers
      continue;
    } else if (inHunk) {
      if (
        line === "" ||
        line[0] === " " ||
        line[0] === "+" ||
        line[0] === "-"
      ) {
        currentHunkLines.push(line);
      } else {
        console.warn(`Ignoring unexpected line in hunk: ${line}`);
      }
    } else {
      // Skip lines before the first hunk header
    }
  }

  // Commit the remaining hunk
  if (currentHunkLines.length) {
    hunks.push(currentHunkLines.join("\n"));
  }

  // Deduplicate hunks
  const seen = new Set<string>();
  const uniqueHunks: string[] = [];
  for (const h of hunks) {
    // Pre-process the hunk to remove empty lines,
    // trailing whitespace, and normalize line endings.
    const normalizedHunk = (({ before, after }) =>
      beforeAfterToHunk(before, after))(hunkToBeforeAfter(h));

    if (!normalizedHunk) {
      continue;
    }

    if (seen.has(normalizedHunk)) continue;
    seen.add(normalizedHunk);

    uniqueHunks.push(normalizedHunk);
  }

  let newContent = original;
  if (newContent === null) {
    throw new Error("No content for original file");
  }

  // Attempt to apply each hunk
  for (const hunk of uniqueHunks) {
    let maybeNewContent = applyHunk(newContent, hunk);
    if (!maybeNewContent) {
      console.error(`Failed to apply hunk:\n${hunk}`);
      continue;
    }

    newContent = maybeNewContent;
  }

  return newContent;
}

function applyHunk(content: string, hunk: string): string | null {
  let { before, after } = hunkToBeforeAfter(hunk);
  let newContent = content;

  // If there's no "before", we just assume it's an append
  if (!before.trim()) {
    return newContent + after;
  }

  // Otherwise, we try 2 different approaches.

  // 1) If there's only one occurrence of "before", we can simply replace it with "after"
  if (countOccurrences(newContent, before) === 1) {
    return newContent.replace(before, after);
  }

  // 2) Fuzzy approach

  // Attempt to remove from "before" the lines that are not in the "content".
  // This helps ignore LLM errors in the hunk.
  before = cleanBefore(newContent, before);
  const cleanedHunk = beforeAfterToHunk(before, after);

  // Then group the lines in this new hunk into contiguous sections that have the same operation.
  const groupedHunkLines = groupHunkLinesByOperation(cleanedHunk.split("\n"));

  // We try to partially apply the hunk progressively by looking at the sections with a
  // sliding window of 3 sections at a time.
  // This effectively allows to discard leading or trailing lines from the hunk
  // if they don't work.
  for (let i = 2; i < groupedHunkLines.length; i += 2) {
    const precedingContext = groupedHunkLines[i - 2];
    const currentContext = groupedHunkLines[i - 1];
    const followingContext = groupedHunkLines[i];

    const result = applyPartialHunk(
      newContent,
      precedingContext,
      currentContext,
      followingContext
    );

    if (!result) {
      // We cannot apply the hunk, so we skip it.
      return null;
    }

    newContent = result;
  }

  return newContent;
}

function countOccurrences(text: string, search: string): number {
  if (!search) return 0;

  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (text.match(new RegExp(escapedSearch, "g")) || []).length;
}

function beforeAfterToHunk(before: string, after: string): string {
  const result = diffLines(before, after);
  const out: string[] = [];

  for (const change of result) {
    const prefix = change.added ? "+" : change.removed ? "-" : " ";
    const lines = change.value.split("\n").filter(Boolean);

    out.push(...lines.map((l) => prefix + l));
  }

  return out.join("\n");
}

function hunkToBeforeAfter(hunk: string): { before: string; after: string } {
  let beforeText = "";
  let afterText = "";

  for (const line of hunk.split("\n")) {
    if (!line.length) continue;

    const [op, ...rest] = line; //+ - or space
    const text = rest.join("") + "\n";

    switch (op) {
      case " ": // unchanged
        beforeText += text;
        afterText += text;

        break;

      case "-": // removed
        beforeText += text;
        break;

      case "+": // added
        afterText += text;
        break;
    }
  }

  return {
    before: beforeText.trimEnd(),
    after: afterText.trimEnd(),
  };
}

function cleanBefore(content: string, before: string): string {
  // We get the diff between the before and the content.
  // The potential additions are removed from the before,
  const changes = diffLines(before, content);
  // let newBefore = changes.filter((c) => !c.added).join("");
  let newBefore = "";

  for (const c of changes) {
    if (!c.added) {
      newBefore += c.value;
    }
  }

  if (!newBefore || newBefore.trim().length < 10) {
    // If we end up with less than 10 lines in the cleaned before,
    // we return the original before
    return before;
  }

  const beforeLines = before.split("\n");
  const newBeforeLines = newBefore.split("\n");

  if (newBeforeLines.length < beforeLines.length * 0.66) {
    // If we end up with less than 66% of the original lines in the cleaned before,
    // we return the original before
    return before;
  }

  return newBefore;
}

function groupHunkLinesByOperation(lines: string[]): string[][] {
  const sections: string[][] = [];

  let cur: string[] = [];
  let curOp = " ";

  for (const line of lines) {
    const op = line[0] || " ";

    if (op !== curOp) {
      if (cur.length) sections.push(cur);
      cur = [];
      curOp = op;
    }

    cur.push(line);
  }

  if (cur.length) {
    sections.push(cur);
  }

  return sections;
}

function applyPartialHunk(
  content: string,
  // Groups of hunk lines that have the same operation
  // (" ", "-", "+")
  previousGroup: string[],
  currentGroup: string[],
  followingGroup: string[]
): string | null {
  const previousGroupLength = previousGroup.length;
  const followingGroupLength = followingGroup.length;

  // We start by trying to use all lines from either the previous or following groups.
  const useAll = previousGroupLength + followingGroupLength;

  // Then we progressively drop more lines from the previous / following group
  // until we hopefully managed to apply the hunk.
  // Ee try all combinations of dropping lines from the previous (leading lines)
  // and following groups(trailing lines)
  for (let drop = 0; drop <= useAll; drop++) {
    // Total number of lines that we'll use
    const use = useAll - drop;

    // Begin by trying to use all lines from the previous group.
    // Then we progressively drop more lines from the previous group
    // (and these lines are allocated to the following group)
    for (let usePrev = previousGroupLength; usePrev >= 0; usePrev--) {
      // Skip until usePrev is less than use.
      if (usePrev > use) continue;

      // Then we allocate the remaining lines to the following group.
      const useFoll = use - usePrev;

      // Skip if we're trying to use more lines from the following group
      // than it actually has.
      if (useFoll > followingGroupLength) continue;

      // Then we slice the lines from the previous and following groups,
      // removing leading lines from the previous group and trailing lines from the following group.
      const slicePrev = usePrev ? previousGroup.slice(-usePrev) : [];
      const sliceFoll = useFoll ? followingGroup.slice(0, useFoll) : [];

      // We join the lines into a single hunk and try to apply it.
      const hunk = [...slicePrev, ...currentGroup, ...sliceFoll].join("\n");
      const { before, after } = hunkToBeforeAfter(hunk);

      // If we find a single match, we directly apply the hunk.
      const count = countOccurrences(content, before);
      if (count === 1) {
        return content.replace(before, after);
      }
    }
  }

  // Apply failed.
  return null;
}
