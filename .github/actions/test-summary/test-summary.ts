import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";

export const COMMENT_MARKER = "<!-- test-summary -->";

const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const TEST_FUNCTIONS = new Set(["it", "test"]);
const GROUP_FUNCTIONS = new Set(["describe"]);

export type TestDefinition = { body: string; line: number };

// Tests keyed by their full title (describe titles joined with the test title).
export type TestBodies = Map<string, TestDefinition>;

// Line is in the head version of the file, except for removed tests where it is in the base one.
export type TestEntry = { title: string; line: number };

export type TestFileSummary = {
  path: string;
  sources: string[];
  added: TestEntry[];
  changed: TestEntry[];
  removed: TestEntry[];
  unchanged: TestEntry[];
};

// Where titles link to: the PR diff for touched tests, the head blob for untouched ones.
export type LinkTargets = { pullUrl: string; repoUrl: string; headSha: string };

type ChangedFile = { status: string; oldPath: string; path: string };

function calleeName(expression: ts.Expression): string | null {
  // Covers it(...), it.skip(...), it.each(...)(...) and describe.concurrent(...).
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isCallExpression(expression)
  ) {
    return calleeName(expression.expression);
  }
  return null;
}

function titleText(
  node: ts.Expression | undefined,
  sourceFile: ts.SourceFile
): string {
  if (!node) {
    return "(untitled)";
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return node.getText(sourceFile);
}

export function collectTests(source: string, fileName: string): TestBodies {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const tests: TestBodies = new Map();

  const visit = (node: ts.Node, groups: string[]): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const title = titleText(node.arguments[0], sourceFile);
      if (name && GROUP_FUNCTIONS.has(name)) {
        node.arguments
          .slice(1)
          .forEach((argument) => visit(argument, [...groups, title]));
        return;
      }
      if (name && TEST_FUNCTIONS.has(name)) {
        // Whitespace is collapsed so formatting-only edits do not count as changes.
        const body =
          node.arguments[1]?.getText(sourceFile).replace(/\s+/g, " ") ?? "";
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );
        tests.set([...groups, title].join(" › "), { body, line: line + 1 });
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, groups));
  };
  visit(sourceFile, []);

  return tests;
}

export function diffTests(
  path: string,
  sources: string[],
  before: TestBodies,
  after: TestBodies
): TestFileSummary {
  const summary: TestFileSummary = {
    path,
    sources,
    added: [],
    changed: [],
    removed: [],
    unchanged: [],
  };
  for (const [title, { body, line }] of after) {
    const previous = before.get(title);
    if (!previous) {
      summary.added.push({ title, line });
    } else if (previous.body !== body) {
      summary.changed.push({ title, line });
    } else {
      summary.unchanged.push({ title, line });
    }
  }
  summary.removed = [...before]
    .filter(([title]) => !after.has(title))
    .map(([title, { line }]) => ({ title, line }));

  return summary;
}

export function siblingTestPath(sourcePath: string): string {
  return sourcePath.replace(/\.(tsx?)$/, ".test.$1");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[<>`*_|[\]]/g, (character) => `\\${character}`);
}

// GitHub anchors each file of a PR diff on the SHA-256 of its path, then R/L for the new/old side.
function diffAnchor(path: string, side: "L" | "R", line: number): string {
  const fileHash = createHash("sha256").update(path).digest("hex");
  return `#diff-${fileHash}${side}${line}`;
}

function testLink(
  path: string,
  entry: TestEntry,
  kind: "added" | "changed" | "removed" | "unchanged",
  links: LinkTargets | null
): string {
  const title = escapeMarkdown(entry.title);
  if (!links) {
    return title;
  }
  const url =
    kind === "unchanged"
      ? `${links.repoUrl}/blob/${links.headSha}/${path}#L${entry.line}`
      : `${links.pullUrl}/files${diffAnchor(path, kind === "removed" ? "L" : "R", entry.line)}`;
  return `[${title}](${url})`;
}

export function renderSummary(
  files: TestFileSummary[],
  sourcesWithoutTests: string[],
  links: LinkTargets | null = null
): string {
  const count = (key: "added" | "changed" | "removed" | "unchanged") =>
    files.reduce((total, file) => total + file[key].length, 0);

  const lines = [
    COMMENT_MARKER,
    `### 🧪 Test recap`,
    "",
    `**+${count("added")} added · ~${count("changed")} changed · −${count("removed")} removed** · ${count("unchanged")} already tested`,
    "",
  ];

  for (const file of files) {
    const origin =
      file.sources.length > 0
        ? ` (for ${file.sources.map((s) => `\`${s}\``).join(", ")})`
        : "";
    lines.push(`**\`${file.path}\`**${origin}`);
    const link = (
      entry: TestEntry,
      kind: "added" | "changed" | "removed" | "unchanged"
    ) => testLink(file.path, entry, kind, links);
    lines.push(
      ...file.removed.map(
        (entry) => `- ⚠️ **removed**: ${link(entry, "removed")}`
      )
    );
    lines.push(...file.added.map((entry) => `- ➕ ${link(entry, "added")}`));
    lines.push(
      ...file.changed.map((entry) => `- ✏️ ${link(entry, "changed")}`)
    );
    if (file.unchanged.length > 0) {
      lines.push(
        "",
        `<details><summary>${file.unchanged.length} already tested</summary>`,
        "",
        ...file.unchanged.map((entry) => `- ${link(entry, "unchanged")}`),
        "",
        "</details>"
      );
    }
    lines.push("");
  }

  if (sourcesWithoutTests.length > 0) {
    lines.push(
      `<details><summary>${sourcesWithoutTests.length} changed files have no matching test file</summary>`,
      "",
      ...sourcesWithoutTests.map((path) => `- \`${path}\``),
      "",
      "</details>"
    );
  }

  return lines.join("\n");
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1 << 26,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function readAt(revision: string, path: string): string {
  try {
    return git(["show", `${revision}:${path}`]);
  } catch {
    return "";
  }
}

function existsAt(revision: string, path: string): boolean {
  try {
    git(["cat-file", "-e", `${revision}:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function changedFiles(base: string, head: string): ChangedFile[] {
  return git(["diff", "--name-status", "--find-renames", base, head])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, oldPath, newPath] = line.split("\t");
      return { status, oldPath, path: newPath ?? oldPath };
    });
}

export function summarize(
  base: string,
  head: string,
  pullUrl: string | null = null
): string | null {
  const mergeBase = git(["merge-base", base, head]).trim();
  const changes = changedFiles(mergeBase, head);

  // Each test file to report, with the path it had at the merge base and the sources it covers.
  const testFiles = new Map<string, { oldPath: string; sources: string[] }>();
  const sourcesWithoutTests: string[] = [];

  for (const change of changes) {
    if (TEST_FILE.test(change.path)) {
      const entry = testFiles.get(change.path);
      testFiles.set(change.path, {
        oldPath: change.oldPath,
        sources: entry?.sources ?? [],
      });
      continue;
    }
    if (
      !SOURCE_FILE.test(change.path) ||
      change.path.endsWith(".d.ts") ||
      change.status.startsWith("D")
    ) {
      continue;
    }
    const testPath = siblingTestPath(change.path);
    if (!existsAt(head, testPath)) {
      sourcesWithoutTests.push(change.path);
      continue;
    }
    const entry = testFiles.get(testPath) ?? { oldPath: testPath, sources: [] };
    testFiles.set(testPath, {
      ...entry,
      sources: [...entry.sources, change.path],
    });
  }

  if (testFiles.size === 0) {
    return null;
  }

  const summaries = [...testFiles].map(([path, { oldPath, sources }]) =>
    diffTests(
      path,
      sources,
      collectTests(readAt(mergeBase, oldPath), oldPath),
      collectTests(readAt(head, path), path)
    )
  );

  const links = pullUrl
    ? {
        pullUrl,
        repoUrl: pullUrl.replace(/\/pull\/\d+$/, ""),
        headSha: git(["rev-parse", head]).trim(),
      }
    : null;

  return renderSummary(summaries, sourcesWithoutTests, links);
}

if (import.meta.main) {
  const [base = "origin/main", head = "HEAD", pullUrl = null] =
    process.argv.slice(2);
  console.log(
    summarize(base, head, pullUrl) ?? "No tests related to this change."
  );
}
