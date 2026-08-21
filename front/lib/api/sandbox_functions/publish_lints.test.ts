import { lintSandboxFunctionPublish } from "@app/lib/api/sandbox_functions/publish_lints";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const plainInputSchema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

// The exact shape the skill-mandated shim compiles to (verified against prod bundles).
const SPAWN_SYNC_BUNDLE = [
  "var import_child_process = require('child_process');",
  "function callTool(server, tool, args) {",
  '  const res = spawnSync("dsbx", cliArgs, { encoding: "utf-8" });',
  "  return JSON.parse(res.stdout);",
  "}",
].join("\n");

describe("lintSandboxFunctionPublish", () => {
  it("warns when a fast bundle spawns dsbx, naming the call site and the runtime 403", () => {
    const warnings = lintSandboxFunctionPublish({
      bundleCode: SPAWN_SYNC_BUNDLE,
      executionMode: "fast",
      inputSchema: plainInputSchema,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('spawnSync("dsbx"');
    // The call site: spawnSync sits on line 3 of the bundle above.
    expect(warnings[0]).toContain("bundle line 3");
    expect(warnings[0]).toContain("fast_function_called_tools");
    expect(warnings[0]).toContain("confirmFast");
  });

  it("warns on a shell string invoking dsbx tools", () => {
    const warnings = lintSandboxFunctionPublish({
      bundleCode:
        'execSync(`dsbx tools call gmail create_draft --json "$ARGS"`);',
      executionMode: "fast",
      inputSchema: plainInputSchema,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("dsbx tools");
  });

  it("does not warn on a durable bundle that calls tools", () => {
    expect(
      lintSandboxFunctionPublish({
        bundleCode: SPAWN_SYNC_BUNDLE,
        executionMode: "durable",
        inputSchema: plainInputSchema,
      })
    ).toEqual([]);
  });

  it("does not warn on a fast bundle without tool-call signatures", () => {
    expect(
      lintSandboxFunctionPublish({
        bundleCode: 'export default { fetch: async () => new Response("ok") };',
        executionMode: "fast",
        inputSchema: plainInputSchema,
      })
    ).toEqual([]);
  });

  it("is silenced by confirmFast", () => {
    expect(
      lintSandboxFunctionPublish({
        bundleCode: SPAWN_SYNC_BUNDLE,
        executionMode: "fast",
        inputSchema: plainInputSchema,
        confirmFast: true,
      })
    ).toEqual([]);
  });

  it("warns on identity-shaped input properties, pointing at currentUser()", () => {
    const warnings = lintSandboxFunctionPublish({
      bundleCode: "export default {};",
      executionMode: "durable",
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string" },
          requestedBy: { type: "string" },
          userId: { type: "string" },
        },
      },
    });

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("`requestedBy`");
    expect(warnings[1]).toContain("`userId`");
    for (const warning of warnings) {
      expect(warning).toContain("currentUser()");
      expect(warning).toContain("@dust/pod");
    }
  });

  it("does not flag properties that merely reference another user", () => {
    // Exact-match only: `assigneeUserId` legitimately names a different user than the caller.
    expect(
      lintSandboxFunctionPublish({
        bundleCode: "export default {};",
        executionMode: "durable",
        inputSchema: {
          type: "object",
          properties: { assigneeUserId: { type: "string" } },
        },
      })
    ).toEqual([]);
  });

  it("confirmFast does not silence identity warnings", () => {
    const warnings = lintSandboxFunctionPublish({
      bundleCode: "export default {};",
      executionMode: "fast",
      inputSchema: {
        type: "object",
        properties: { userId: { type: "string" } },
      },
      confirmFast: true,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("`userId`");
  });

  it("handles an input schema without properties", () => {
    expect(
      lintSandboxFunctionPublish({
        bundleCode: "export default {};",
        executionMode: "fast",
        inputSchema: { type: "object" },
      })
    ).toEqual([]);
  });
});
