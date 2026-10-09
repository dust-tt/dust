import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";

export const COMMENT_MARKER = "<!-- test-summary -->";

const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const TEST_FUNCTIONS = new Set(["it", "test"]);
const GROUP_FUNCTIONS = new Set(["describe"]);

export type TestDefinition = {
  groups: string[];
  name: string;
  body: string;
  line: number;
};

// Tests keyed by their full title (describe titles joined with the test title).
export type TestBodies = Map<string, TestDefinition>;

// Line is in the head version of the file, except for removed tests where it is in the base one.
export type TestEntry = { groups: string[]; name: string; line: number };

// Top-level declarations of the source file a test file sits next to, by name, with their line.
export type SourceDefinitions = { path: string; lines: Map<string, number> };

export type TestFileSummary = {
  path: string;
  source: SourceDefinitions | null;
  added: TestEntry[];
  changed: TestEntry[];
  removed: TestEntry[];
  unchanged: TestEntry[];
};

// Where titles link to: the PR diff for touched tests, the head blob for untouched ones.
export type LinkTargets = { pullUrl: string; repoUrl: string; headSha: string };

type ChangedFile = { status: string; oldPath: string; path: string };

// Parsing a .ts file as TSX misreads generic arrows and angle-bracket casts, dropping tests.
function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function calleeName(expression: ts.Expression): string | null {
  // Covers it(...), it.skip(...), it.each(...)(...), it.each`...`(...) and describe.concurrent(...).
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isCallExpression(expression)
  ) {
    return calleeName(expression.expression);
  }
  if (ts.isTaggedTemplateExpression(expression)) {
    return calleeName(expression.tag);
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
  const sourceFile = parse(source, fileName);
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
        // The callee is hashed with the test function so edits to it.each case tables count as
        // changes. Whitespace is collapsed so formatting-only edits do not.
        const body = [node.expression, node.arguments[1]]
          .map((part) => part?.getText(sourceFile) ?? "")
          .join(" ")
          .replace(/\s+/g, " ");
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );
        // Same-titled tests are keyed by occurrence so neither hides the other.
        const fullTitle = [...groups, title].join(" › ");
        let key = fullTitle;
        for (let occurrence = 2; tests.has(key); occurrence++) {
          key = `${fullTitle} #${occurrence}`;
        }
        tests.set(key, {
          groups,
          name: title,
          body,
          line: line + 1,
        });
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, groups));
  };
  visit(sourceFile, []);

  return tests;
}

export function collectDefinitions(
  source: string,
  fileName: string
): Map<string, number> {
  const sourceFile = parse(source, fileName);
  const lines = new Map<string, number>();
  const record = (name: ts.Node) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      name.getStart(sourceFile)
    );
    lines.set(name.getText(sourceFile), line + 1);
  };

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      record(statement.name);
    }
    if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations
        .map((declaration) => declaration.name)
        .filter(ts.isIdentifier)
        .forEach(record);
    }
  }

  return lines;
}

export function diffTests(
  path: string,
  source: SourceDefinitions | null,
  before: TestBodies,
  after: TestBodies
): TestFileSummary {
  const summary: TestFileSummary = {
    path,
    source,
    added: [],
    changed: [],
    removed: [],
    unchanged: [],
  };
  for (const [title, { groups, name, body, line }] of after) {
    const previous = before.get(title);
    if (!previous) {
      summary.added.push({ groups, name, line });
    } else if (previous.body !== body) {
      summary.changed.push({ groups, name, line });
    } else {
      summary.unchanged.push({ groups, name, line });
    }
  }
  summary.removed = [...before]
    .filter(([title]) => !after.has(title))
    .map(([, { groups, name, line }]) => ({ groups, name, line }));

  return summary;
}

export function siblingTestPath(sourcePath: string): string {
  return sourcePath.replace(/\.(tsx?)$/, ".test.$1");
}

export function siblingSourcePath(testPath: string): string {
  return testPath.replace(/\.test\.(tsx?)$/, ".$1");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[<>`*_|[\]]/g, (character) => `\\${character}`);
}

// GitHub anchors each file of a PR diff on the SHA-256 of its path, then R/L for the new/old side.
function diffAnchor(path: string, side: "L" | "R", line: number): string {
  const fileHash = createHash("sha256").update(path).digest("hex");
  return `#diff-${fileHash}${side}${line}`;
}

function blobUrl(links: LinkTargets, path: string, line?: number): string {
  const anchor = line ? `#L${line}` : "";
  return `${links.repoUrl}/blob/${links.headSha}/${path}${anchor}`;
}

function testLink(
  path: string,
  entry: TestEntry,
  kind: "added" | "changed" | "removed" | "unchanged",
  links: LinkTargets | null
): string {
  const name = escapeMarkdown(entry.name);
  if (!links) {
    return name;
  }
  const url =
    kind === "unchanged"
      ? blobUrl(links, path, entry.line)
      : `${links.pullUrl}/files${diffAnchor(path, kind === "removed" ? "L" : "R", entry.line)}`;
  return `[${name}](${url})`;
}

// Describe titles naming a declaration of the source file link to that declaration.
function groupLink(
  group: string,
  source: SourceDefinitions | null,
  links: LinkTargets | null
): string {
  const line = source?.lines.get(group);
  if (!links || !source || !line) {
    return escapeMarkdown(group);
  }
  return `[\`${group}\`](${blobUrl(links, source.path, line)})`;
}

// Colored symbols only render through GitHub math, as emoji cannot be tinted.
const CHANGE_MARKERS = {
  added: "$`\\color{#3fb950}{+}`$",
  changed: "$`\\color{#d29922}{\\sim}`$",
  removed: "$`\\color{#f85149}{-}`$",
};

export function renderSummary(
  files: TestFileSummary[],
  sourcesWithoutTests: string[],
  links: LinkTargets | null = null
): string {
  const lines = [COMMENT_MARKER, "### Test recap", ""];

  for (const file of files) {
    const fileName = `\`${file.path}\``;
    lines.push(
      "---",
      "",
      `#### 📄 ${links ? `[${fileName}](${blobUrl(links, file.path)})` : fileName}`,
      ""
    );
    const groupTitle = (entry: TestEntry) =>
      entry.groups
        .map((group) => groupLink(group, file.source, links))
        .join(" › ");

    // Changed tests are listed under their describe titles, one block per group.
    const blocks = new Map<string, string[]>();
    for (const kind of ["added", "changed", "removed"] as const) {
      for (const entry of file[kind]) {
        const title = groupTitle(entry);
        const test = testLink(file.path, entry, kind, links);
        const line = `${title ? "&emsp;" : ""}${CHANGE_MARKERS[kind]} ${kind === "removed" ? `~~${test}~~` : test}`;
        blocks.set(title, [...(blocks.get(title) ?? []), line]);
      }
    }
    if (blocks.size === 0) {
      lines.push("_No test changes._", "");
    }
    for (const [title, entries] of blocks) {
      // A trailing backslash breaks the line without starting a new paragraph.
      lines.push([...(title ? [title] : []), ...entries].join("\\\n"), "");
    }

    if (file.unchanged.length > 0) {
      lines.push(
        "<details>",
        `<summary>✅ ${file.unchanged.length} already tested</summary>`,
        "",
        ...file.unchanged.map(
          (entry) =>
            `- ${[groupTitle(entry), testLink(file.path, entry, "unchanged", links)].filter(Boolean).join(" › ")}`
        ),
        "",
        "</details>",
        ""
      );
    }
  }

  if (sourcesWithoutTests.length > 0) {
    lines.push(
      "---",
      "",
      "#### 🚫 Changed files without a test file",
      "",
      ...sourcesWithoutTests.map((path) => `- \`${path}\``),
      ""
    );
  }

  return lines.join("\n");
}

// GitHub rejects comments longer than 65536 characters. Cutting on a line boundary keeps links
// whole, and open collapsed sections are closed so the note stays visible.
export function truncateSummary(summary: string, limit = 60000): string {
  if (summary.length <= limit) {
    return summary;
  }
  const kept = summary.slice(0, summary.lastIndexOf("\n", limit));
  const openSections =
    kept.split("<details>").length - kept.split("</details>").length;
  return [
    kept,
    ...Array.from({ length: openSections }, () => "\n</details>"),
    "\n_Summary truncated: run the script locally for the full list._",
  ].join("\n");
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

  // Each test file to report, with the path it had at the merge base.
  const testFiles = new Map<string, { oldPath: string }>();
  const sourcesWithoutTests: string[] = [];

  for (const change of changes) {
    if (TEST_FILE.test(change.path)) {
      testFiles.set(change.path, { oldPath: change.oldPath });
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
    if (!testFiles.has(testPath)) {
      testFiles.set(testPath, { oldPath: testPath });
    }
  }

  if (testFiles.size === 0) {
    return null;
  }

  const summaries = [...testFiles].map(([path, { oldPath }]) => {
    const sourcePath = siblingSourcePath(path);
    const source = existsAt(head, sourcePath)
      ? {
          path: sourcePath,
          lines: collectDefinitions(readAt(head, sourcePath), sourcePath),
        }
      : null;
    return diffTests(
      path,
      source,
      collectTests(readAt(mergeBase, oldPath), oldPath),
      collectTests(readAt(head, path), path)
    );
  });

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
  const summary = summarize(base, head, pullUrl);
  console.log(
    summary ? truncateSummary(summary) : "No tests related to this change."
  );
}
