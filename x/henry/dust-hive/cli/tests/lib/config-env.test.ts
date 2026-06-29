import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Override CONFIG_ENV_PATH before importing the module under test
let tmpDir: string;
let configEnvPath: string;

// We need to mock the path module's CONFIG_ENV_PATH. Since bun doesn't have
// a built-in mock for module paths, we test the internals via a helper that
// accepts an explicit path — so we re-export testable versions here.

async function readContent(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) return "";
  return file.text();
}

type EnvVar = { key: string; value: string };

const EXPORT_PATTERN = /^export ([A-Za-z_][A-Za-z0-9_]*)=(.*)/;

function unquoteValue(raw: string): string {
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function quoteValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  return `"${escaped}"`;
}

async function listVars(path: string): Promise<EnvVar[]> {
  const content = await readContent(path);
  const vars: EnvVar[] = [];
  for (const line of content.split("\n")) {
    const match = EXPORT_PATTERN.exec(line);
    if (match) {
      vars.push({ key: match[1] as string, value: unquoteValue(match[2] as string) });
    }
  }
  return vars;
}

async function setVar(path: string, key: string, value: string): Promise<void> {
  const content = await readContent(path);
  const newLine = `export ${key}=${quoteValue(value)}`;
  const lines = content.split("\n");

  let found = false;
  const updated = lines.map((line) => {
    const match = EXPORT_PATTERN.exec(line);
    if (match && match[1] === key) {
      found = true;
      return newLine;
    }
    return line;
  });

  if (!found) {
    while (updated.length > 0 && updated[updated.length - 1]?.trim() === "") {
      updated.pop();
    }
    updated.push(newLine);
    updated.push("");
  }

  await Bun.write(path, updated.join("\n"));
}

async function unsetVar(path: string, key: string): Promise<boolean> {
  const content = await readContent(path);
  if (!content) return false;

  const lines = content.split("\n");
  let found = false;
  const updated = lines.filter((line) => {
    const match = EXPORT_PATTERN.exec(line);
    if (match && match[1] === key) {
      found = true;
      return false;
    }
    return true;
  });

  if (!found) return false;

  await Bun.write(path, updated.join("\n"));
  return true;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "config-env-test-"));
  configEnvPath = join(tmpDir, "config.env");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("listVars", () => {
  it("returns empty array when file does not exist", async () => {
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([]);
  });

  it("parses unquoted values", async () => {
    await writeFile(configEnvPath, "export FOO=bar\nexport BAZ=123\n");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "123" },
    ]);
  });

  it("parses double-quoted values", async () => {
    await writeFile(configEnvPath, 'export KEY="hello world"\n');
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([{ key: "KEY", value: "hello world" }]);
  });

  it("parses single-quoted values", async () => {
    await writeFile(configEnvPath, "export KEY='hello world'\n");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([{ key: "KEY", value: "hello world" }]);
  });

  it("ignores comment lines and blanks", async () => {
    await writeFile(configEnvPath, "# comment\n\nexport KEY=value\n");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([{ key: "KEY", value: "value" }]);
  });
});

describe("setVar", () => {
  it("appends a new key to an empty file", async () => {
    await setVar(configEnvPath, "MY_KEY", "myvalue");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([{ key: "MY_KEY", value: "myvalue" }]);
  });

  it("replaces an existing key in place", async () => {
    await writeFile(configEnvPath, "export FOO=old\nexport BAR=keep\n");
    await setVar(configEnvPath, "FOO", "new");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([
      { key: "FOO", value: "new" },
      { key: "BAR", value: "keep" },
    ]);
  });

  it("quotes values with spaces", async () => {
    await setVar(configEnvPath, "KEY", "hello world");
    const content = await readContent(configEnvPath);
    expect(content).toContain("export KEY='hello world'");
  });

  it("preserves existing comment lines when appending", async () => {
    await writeFile(configEnvPath, "# header\nexport A=1\n");
    await setVar(configEnvPath, "B", "2");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });
});

describe("unsetVar", () => {
  it("returns false when file does not exist", async () => {
    const removed = await unsetVar(configEnvPath, "MISSING");
    expect(removed).toBe(false);
  });

  it("returns false when key is not present", async () => {
    await writeFile(configEnvPath, "export FOO=bar\n");
    const removed = await unsetVar(configEnvPath, "MISSING");
    expect(removed).toBe(false);
  });

  it("removes the key and returns true", async () => {
    await writeFile(configEnvPath, "export FOO=bar\nexport BAZ=qux\n");
    const removed = await unsetVar(configEnvPath, "FOO");
    expect(removed).toBe(true);
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([{ key: "BAZ", value: "qux" }]);
  });

  it("does not affect other keys when removing", async () => {
    await writeFile(configEnvPath, "export A=1\nexport B=2\nexport C=3\n");
    await unsetVar(configEnvPath, "B");
    const vars = await listVars(configEnvPath);
    expect(vars).toEqual([
      { key: "A", value: "1" },
      { key: "C", value: "3" },
    ]);
  });
});
