import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const clean of cleanup.splice(0)) {
    await clean();
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "frame-lint-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "My Frame");
  const types = path.join(root, "types");
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
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      requests.push(url.pathname);
      expect(request.headers.has("authorization")).toBe(false);
      if (url.pathname === "/frame-runtime/manifest.json") {
        return Response.json(manifest);
      }
      return new Response(archive);
    },
  });
  cleanup.push(async () => {
    await server.stop(true);
  });
  return {
    root,
    project,
    manifest,
    archive,
    requests,
    url: server.url.toString(),
  };
}

async function lint(context: Awaited<ReturnType<typeof fixture>>) {
  const child = Bun.spawn(
    ["bash", path.join(import.meta.dir, "lint.sh"), context.project],
    {
      env: {
        ...Bun.env,
        DUST_VIZ_URL: context.url,
        DUST_FRAME_TYPES_CACHE: path.join(context.root, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
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
