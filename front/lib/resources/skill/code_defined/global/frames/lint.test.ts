import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
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

async function fixture() {
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
    modules: ["react"],
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
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function lint(context: Awaited<ReturnType<typeof fixture>>) {
  vi.stubEnv("DUST_VIZ_URL", context.url);
  vi.stubEnv("DUST_FRAME_TYPES_CACHE", path.join(context.root, "cache"));
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

test("lints source in place, skips backend folders and refreshes cached types", async () => {
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
  expect(broken.stdout).toContain("value.ts:2:14:");
  expect(broken.stdout).toContain("TS2322");
  expect(broken.stdout).not.toContain("server.ts");
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

test("refuses to replace an existing project config", async () => {
  const context = await fixture();
  const config = '{"compilerOptions":{"strict":false}}';
  await writeFile(path.join(context.project, "tsconfig.json"), config);
  const result = await lint(context);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Refusing to replace");
  expect(
    await readFile(path.join(context.project, "tsconfig.json"), "utf8")
  ).toBe(config);
  expect(context.requests).toEqual([]);
});
