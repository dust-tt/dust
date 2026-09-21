import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { FRAME_SKILL_FILES } from "@app/lib/resources/skill/code_defined/global/frames/files";
import { isString } from "@app/types/shared/utils/general";
import assert from "assert";
import { afterEach, expect, test, vi } from "vitest";

const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const clean of cleanup.splice(0)) {
    await clean();
  }
});

async function fixture(frameRoot = "conversation-conv_123/My Frame") {
  const root = await mkdtemp(path.join(tmpdir(), "frame-lint-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "My Frame");
  const types = path.join(root, "types");
  const skill = path.join(root, "skills", "Create Frames");
  await mkdir(skill, { recursive: true });
  for (const file of FRAME_SKILL_FILES) {
    await writeFile(path.join(skill, file.fileName), file.content);
  }
  await mkdir(project);
  await mkdir(types);
  await writeFile(path.join(project, "index.tsx"), "export default () => 42\n");
  await writeFile(path.join(types, "index.d.ts"), "export {}\n");
  await writeFile(
    path.join(types, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        types: [],
        allowJs: true,
        checkJs: true,
        resolveJsonModule: true,
        jsx: "preserve",
      },
    })
  );
  const archivePath = path.join(root, "types.tgz");
  execFileSync("tar", ["-czf", archivePath, "-C", types, "."]);
  const archive = await readFile(archivePath);
  const checksum = createHash("sha256").update(archive).digest("hex");
  const manifest = {
    version: 1,
    id: "a".repeat(64),
    modules: ["react", "@dust/react-hooks"],
    tarballSha256: checksum,
    sizeBytes: archive.length,
    path: `/frame-runtime/${checksum}.tgz`,
  };
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    expect(request.headers.authorization).toBeUndefined();
    response.end(
      url === "/frame-runtime/manifest.json"
        ? JSON.stringify(manifest)
        : archive
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanup.push(
    () => new Promise<void>((resolve) => server.close(() => resolve()))
  );
  const address = server.address();
  assert(address && !isString(address));
  return {
    root,
    project,
    manifest,
    archive,
    requests,
    skill,
    frameRoot,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function lint(context: Awaited<ReturnType<typeof fixture>>) {
  vi.stubEnv("DUST_VIZ_URL", context.url);
  vi.stubEnv("DUST_FRAME_ROOT", context.frameRoot);
  vi.stubEnv("DUST_FRAME_TYPES_CACHE", path.join(context.root, "cache"));
  vi.stubEnv(
    "DUST_FRAME_CHECKER_CACHE",
    path.join(context.root, "checker-cache")
  );
  const child = spawn(
    "bash",
    [path.join(context.skill, "lint.sh"), context.project],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (data: string) => {
    stdout += data;
  });
  child.stderr.setEncoding("utf8").on("data", (data: string) => {
    stderr += data;
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { stdout, stderr, exitCode };
}

async function addFunctionHooks(context: Awaited<ReturnType<typeof fixture>>) {
  await writeFile(
    path.join(context.project, "hooks.d.ts"),
    `declare module "@dust/react-hooks" {
  export function useFrameFunction(name: string, args: object): unknown
  export function useFrameFunctionMutation(name: string): unknown
  export { useFrameFunction as usePodFunction, useFrameFunctionMutation as usePodFunctionMutation }
  export function callFunction(name: string): unknown
}\n`
  );
}

async function writeManifest(
  context: Awaited<ReturnType<typeof fixture>>,
  names: string[]
) {
  await writeFile(
    path.join(context.project, "manifest.json"),
    JSON.stringify({
      version: 1,
      name: "Tasks",
      description: "Track tasks",
      functions: names.map((name) => ({
        name,
        description: name,
        entryPoint: `functions/${name}.ts`,
      })),
    })
  );
}

test("checks function names across UI files and reads manifest edits on each run", async () => {
  const context = await fixture();
  await addFunctionHooks(context);
  await writeManifest(context, ["add-task", "list-tasks"]);
  await writeFile(
    path.join(context.project, "index.tsx"),
    [
      'import { useFrameFunction, useFrameFunctionMutation as useMutation } from "@dust/react-hooks"',
      'import TaskList from "./components/TaskList"',
      'import Other from "./other"',
      "export default function App() {",
      '  useFrameFunction("add-tasks", {})',
      '  useMutation("missing-mutation")',
      "  return [TaskList, Other]",
      "}",
    ].join("\n")
  );
  await mkdir(path.join(context.project, "components"));
  await writeFile(
    path.join(context.project, "components/TaskList.tsx"),
    [
      'import * as hooks from "@dust/react-hooks"',
      "export default function TaskList() {",
      '  hooks.usePodFunction("missing-legacy", {})',
      "  hooks.usePodFunctionMutation(`missing-legacy-mutation`)",
      "  return null",
      "}",
    ].join("\n")
  );
  await writeFile(
    path.join(context.project, "other.jsx"),
    'import { useFrameFunction as useFunction } from "@dust/react-hooks"\n' +
      'export default function Other() { useFunction("missing-alias", {}); return null }\n'
  );

  const broken = await lint(context);
  expect(broken.exitCode).toBe(1);
  expect(broken.stdout, broken.stderr).toContain("index.tsx:5:20:");
  expect(broken.stdout).toContain("components/TaskList.tsx:3:24:");
  expect(broken.stdout).toContain("other.jsx:2:47:");
  expect(broken.stdout).toContain("dust(declared-frame-functions)");
  expect(broken.stdout).toContain(
    "Declared functions: 'add-task', 'list-tasks'."
  );
  for (const call of [
    "useFrameFunction('add-tasks')",
    "useFrameFunctionMutation('missing-mutation')",
    "usePodFunction('missing-legacy')",
    "usePodFunctionMutation('missing-legacy-mutation')",
    "useFrameFunction('missing-alias')",
  ]) {
    expect(broken.stdout).toContain(call);
  }

  await writeManifest(context, [
    "add-tasks",
    "missing-mutation",
    "missing-legacy",
    "missing-legacy-mutation",
    "missing-alias",
  ]);
  const fixed = await lint(context);
  expect(fixed.exitCode, fixed.stdout + fixed.stderr).toBe(0);
});

test("ignores computed names, unrelated hooks, shadowed imports and backend code", async () => {
  const context = await fixture();
  await addFunctionHooks(context);
  await writeManifest(context, ["list-tasks"]);
  await writeFile(
    path.join(context.project, "index.tsx"),
    `import { useFrameFunction, callFunction } from "@dust/react-hooks"
import * as hooks from "@dust/react-hooks"
import { useFrameFunction as useLocalFunction } from "./local-hooks"
export default function App({ name }: { name: string }) {
  useFrameFunction("list-tasks", {})
  hooks.useFrameFunction("list-tasks", {})
  useFrameFunction(name, {})
  useFrameFunction(\`prefix-\${name}\`, {})
  useLocalFunction("not-a-frame-function")
  callFunction("unchecked")
  return null
}
export function Shadow({ useFrameFunction }: { useFrameFunction: (name: string) => void }) {
  useFrameFunction("shadowed")
  return null
}
export function NamespaceShadow({ hooks }: { hooks: { useFrameFunction: (name: string) => void } }) {
  hooks.useFrameFunction("shadowed-namespace")
  return null
}\n`
  );
  await writeFile(
    path.join(context.project, "local-hooks.ts"),
    "export const useFrameFunction = (name: string) => name\n"
  );
  await mkdir(path.join(context.project, "functions"));
  await writeFile(
    path.join(context.project, "functions/backend.ts"),
    'import { useFrameFunction } from "@dust/react-hooks"\n' +
      'export const run = () => useFrameFunction("backend-only", {})\n'
  );
  const result = await lint(context);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
});

test("skips legacy Frames without a manifest but rejects missing declarations in a manifest", async () => {
  const context = await fixture();
  await addFunctionHooks(context);
  await writeFile(
    path.join(context.project, "index.tsx"),
    'import { useFrameFunction } from "@dust/react-hooks"\n' +
      'export default function App() { useFrameFunction("list-tasks", {}); return null }\n'
  );
  const legacy = await lint(context);
  expect(legacy.exitCode, legacy.stdout + legacy.stderr).toBe(0);
  await writeFile(path.join(context.project, "manifest.json"), "{}\n");
  const broken = await lint(context);
  expect(broken.exitCode).toBe(1);
  expect(broken.stdout).toContain(
    "This Frame's manifest declares no functions."
  );
  await writeFile(path.join(context.project, "manifest.json"), "{invalid\n");
  const malformed = await lint(context);
  expect(malformed.exitCode).not.toBe(0);
  expect(malformed.stderr).toContain("parse error");
});

test("lints current source, skips backend folders and reuses local checker files", async () => {
  const context = await fixture();
  await writeFile(
    path.join(context.project, "index.tsx"),
    "import { value } from './value'; export default () => value\n"
  );
  await writeFile(
    path.join(context.project, "value.ts"),
    "// Keep the original line\nexport const value: number = 'wrong'\n"
  );
  for (const directory of ["functions", "databases"]) {
    await mkdir(path.join(context.project, directory));
    await writeFile(
      path.join(context.project, directory, "server.ts"),
      "import { database } from 'server-only-library'\n"
    );
  }
  const broken = await lint(context);
  expect(broken.exitCode).toBe(1);
  expect(broken.stdout, broken.stderr).toContain("value.ts:2:14:");
  expect(broken.stdout).toContain("TS2322");
  expect(broken.stdout).not.toContain("server.ts");
  expect(await readdir(context.project)).toEqual([
    "databases",
    "functions",
    "index.tsx",
    "value.ts",
  ]);
  await rm(path.join(context.skill, "tsconfig.json"));
  await rm(path.join(context.skill, "oxlintrc.json"));
  await rm(path.join(context.skill, "frame-rules.cjs"));
  await writeFile(
    path.join(context.project, "value.ts"),
    "export const value = 42\n"
  );
  expect((await lint(context)).exitCode).toBe(0);
  expect(context.requests.filter((url) => url.endsWith(".tgz"))).toHaveLength(
    1
  );
  context.manifest.id = "b".repeat(64);
  expect((await lint(context)).exitCode).toBe(0);
  expect(context.requests.filter((url) => url.endsWith(".tgz"))).toHaveLength(
    2
  );
  expect(await readdir(path.join(context.root, "cache"))).toEqual([
    "a".repeat(64),
    "b".repeat(64),
  ]);
});

test("rejects corrupted downloads before creating configs or caching types", async () => {
  const context = await fixture();
  context.archive[0] ^= 1;
  const result = await lint(context);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("checksum mismatch");
  expect(await readdir(path.join(context.root, "cache"))).toEqual([]);
  expect(await readdir(context.project)).toEqual(["index.tsx"]);
});

test.each([
  "conversation-conv_123",
  "pod-pod_123",
])("reports in-package paths in UI and backend code under %s", async (scope) => {
  const frameRoot = `${scope}/My Frame`;
  const context = await fixture(frameRoot);
  const oldChecker = path.join(context.root, "checker-cache", "checker");
  await mkdir(oldChecker, { recursive: true });
  await writeFile(path.join(oldChecker, "lint.sh"), "exit 0\n");
  await writeFile(path.join(context.project, "data.csv"), "value\n42\n");
  await writeFile(
    path.join(context.project, "jsx.d.ts"),
    "declare namespace JSX { interface IntrinsicElements { img: { src: string } } }\n"
  );
  const source = [
    `export const data = "${frameRoot}/data.csv"`,
    `export const template = \`${frameRoot}/data.csv\``,
    `export default () => <img src="${frameRoot}/data.csv" />`,
  ].join("\n");
  await writeFile(path.join(context.project, "index.tsx"), source);
  await mkdir(path.join(context.project, "functions"));
  await writeFile(
    path.join(context.project, "functions/read.ts"),
    `import "server-only-library"\nexport const data = "${frameRoot}/data.csv"\n`
  );

  const broken = await lint(context);
  expect(broken.exitCode).toBe(1);
  expect(broken.stdout, broken.stderr).toContain("index.tsx:1:21:");
  expect(broken.stdout).toContain("index.tsx:2:25:");
  expect(broken.stdout).toContain("index.tsx:3:31:");
  expect(broken.stdout).toContain("functions/read.ts:2:21:");
  expect(broken.stdout).toContain("dust(relative-package-files)");
  expect(broken.stdout).toContain('Use "./data.csv"');
  expect(broken.stdout).not.toContain("TS2307");
  expect(await readFile(path.join(context.project, "index.tsx"), "utf8")).toBe(
    source
  );

  await writeFile(
    path.join(context.project, "index.tsx"),
    [
      'export const relative = "./data.csv"',
      'export const fileId = "fil_ABCDEFGHIJ"',
      'export const external = "conversation-conv_123/other.csv"',
      `export const otherFrame = "${frameRoot}2/data.csv"`,
      'export const otherConversation = "conversation-other/My Frame/data.csv"',
      `export const missing = "${frameRoot}/missing.csv"`,
      `// "${frameRoot}/data.csv"`,
      'export default () => <img src="./data.csv" />',
    ].join("\n")
  );
  await writeFile(
    path.join(context.project, "functions/read.ts"),
    'import "server-only-library"\nexport const data = "./data.csv"\n'
  );
  const valid = await lint(context);
  expect(valid.exitCode, valid.stdout + valid.stderr).toBe(0);
  expect(await readdir(path.join(context.root, "cache"))).toEqual([
    "a".repeat(64),
  ]);
});

test("requires the original scoped root when linting a local copy", async () => {
  const context = await fixture("");
  const result = await lint(context);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Set DUST_FRAME_ROOT");
  expect(context.requests).toEqual([]);
});

test("checks read-only source without changing or using project configs", async () => {
  const context = await fixture();
  const files = {
    "index.tsx":
      "import { value } from './ui/value'; export default () => value\n",
    "tsconfig.json": '{"compilerOptions":{"noCheck":true},"exclude":["**/*"]}',
    ".oxlintrc.json": '{"ignorePatterns":["**/*"]}',
    "ui/value.ts": "export const value: number = 'wrong'\n",
    "ui/tsconfig.json": '{"compilerOptions":{"noCheck":true}}',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(context.project, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    await chmod(file, 0o444);
  }
  await chmod(path.join(context.project, "ui"), 0o555);
  await chmod(context.project, 0o555);
  try {
    const result = await lint(context);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("ui/value.ts:1:14:");
    expect(result.stdout).toContain("TS2322");
    expect(result.stderr).toBe("");
    for (const [name, content] of Object.entries(files)) {
      expect(await readFile(path.join(context.project, name), "utf8")).toBe(
        content
      );
    }
    expect(await readdir(context.project)).toEqual([
      ".oxlintrc.json",
      "index.tsx",
      "tsconfig.json",
      "ui",
    ]);
    expect(await readdir(path.join(context.root, "cache"))).toEqual([
      "a".repeat(64),
    ]);
  } finally {
    await chmod(context.project, 0o755);
    await chmod(path.join(context.project, "ui"), 0o755);
  }
});

test("reports arbitrary Tailwind classes without flagging text or inline styles", async () => {
  const context = await fixture();
  await writeFile(
    path.join(context.project, "jsx.d.ts"),
    "declare namespace JSX { interface IntrinsicElements { div: { className?: string; style?: { height: number }; title?: string } } }\n"
  );
  const declarations = [
    "declare const active: boolean;",
    "declare const height: number;",
    "declare const label: string;",
    "declare const cn: (...classes: unknown[]) => string;",
    "declare const clsx: typeof cn;",
    "declare const classnames: typeof cn;",
  ];
  const brokenSource = [
    ...declarations,
    "export default () => <div>",
    '  <div className="h-[600px] hover:bg-[#ff0000]" />',
    '  <div className={active ? "w-[800px]" : "w-full"} />',
    "  <div className={`h-[${height}px] p-4`} />",
    '  <div className={cn("text-[14px]", {"grid-cols-[200px_1fr]": active})} />',
    '  <div className={clsx([active && "-mt-[4px]"])} />',
    '  <div className={classnames("max-w-[900px]")} />',
    '  <div className="[height:600px]" />',
    "</div>;",
  ].join("\n");
  await writeFile(path.join(context.project, "index.tsx"), brokenSource);

  const broken = await lint(context);
  expect(broken.exitCode).toBe(1);
  expect(broken.stdout, broken.stderr).toContain("index.tsx:8:18:");
  expect(broken.stdout).toContain("tailwindcss(no-arbitrary-value)");
  for (const className of [
    "h-[600px]",
    "hover:bg-[#ff0000]",
    "w-[800px]",
    "h-[",
    "text-[14px]",
    "grid-cols-[200px_1fr]",
    "-mt-[4px]",
    "max-w-[900px]",
    "[height:600px]",
  ]) {
    expect(broken.stdout).toContain(`"${className}" uses an arbitrary value`);
  }
  expect(await readFile(path.join(context.project, "index.tsx"), "utf8")).toBe(
    brokenSource
  );

  await writeFile(
    path.join(context.project, "index.tsx"),
    [
      ...declarations,
      '// Example: className="h-[600px]"',
      "export default () => <div>",
      '  <div className="h-96" style={{height: 600}} title="h-[600px]">h-[600px]</div>',
      '  <div className={label === "h-[600px]" ? "h-96" : "h-full"} />',
      '  <div className={cn({"h-96": label === "h-[600px]"}, active && "w-full")} />',
      '  <div className={`h-96 ${active ? "bg-red-500" : "bg-blue-500"}`} />',
      "</div>;",
    ].join("\n")
  );
  const valid = await lint(context);
  expect(valid.stdout).not.toContain("tailwindcss(no-arbitrary-value)");
  expect(valid.exitCode).toBe(0);
});
