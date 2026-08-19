import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configureSandbox,
  escapingCommandOperands,
  resolveInSandbox,
} from "./sandbox.js";

let root: string;
let outside: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  const base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "dust-cli-sandbox-"))
  );
  root = path.join(base, "workspace");
  outside = path.join(base, "sibling");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(root, "src", "index.ts"), "");
  fs.writeFileSync(path.join(outside, "secrets.env"), "");
  process.chdir(root);
  configureSandbox({});
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe("resolveInSandbox", () => {
  it("accepts paths inside the workspace", () => {
    const res = resolveInSandbox(path.join(root, "src", "index.ts"));

    expect(res.isOk()).toBe(true);
  });

  it("accepts the workspace root itself", () => {
    expect(resolveInSandbox(root).isOk()).toBe(true);
  });

  it("rejects paths outside the workspace", () => {
    const res = resolveInSandbox(path.join(outside, "secrets.env"));

    expect(res.isErr()).toBe(true);
  });

  it("rejects paths that climb out with ..", () => {
    expect(resolveInSandbox("../sibling").isErr()).toBe(true);
  });

  it("rejects a path whose prefix is the workspace name", () => {
    const lookalike = `${root}-other`;
    fs.mkdirSync(lookalike);

    expect(resolveInSandbox(lookalike).isErr()).toBe(true);
  });

  it("rejects a symlink pointing out of the workspace", () => {
    const link = path.join(root, "escape");
    fs.symlinkSync(outside, link);

    expect(resolveInSandbox(path.join(link, "secrets.env")).isErr()).toBe(true);
  });

  it("accepts paths under an explicitly allowed directory", () => {
    configureSandbox({ allowPaths: [outside] });

    expect(resolveInSandbox(path.join(outside, "secrets.env")).isOk()).toBe(
      true
    );
  });

  it("accepts anything once the sandbox is disabled", () => {
    configureSandbox({ disabled: true });

    expect(resolveInSandbox(path.join(outside, "secrets.env")).isOk()).toBe(
      true
    );
  });
});

describe("escapingCommandOperands", () => {
  it("flags an argument that climbs out of the workspace", () => {
    expect(escapingCommandOperands([".."], root)).toEqual([".."]);
  });

  it("flags an absolute path outside the workspace", () => {
    expect(escapingCommandOperands(["-l", outside], root)).toEqual([outside]);
  });

  it("flags a path passed through a --flag=value argument", () => {
    expect(escapingCommandOperands([`--file=${outside}/secrets.env`], root)) //
      .toEqual([`${outside}/secrets.env`]);
  });

  it("leaves arguments inside the workspace alone", () => {
    expect(escapingCommandOperands(["-la", "./src", "."], root)).toEqual([]);
  });

  it("does not treat bare words as paths", () => {
    expect(escapingCommandOperands(["status", "--short"], root)).toEqual([]);
  });
});
