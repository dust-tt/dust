import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AUDIT_ACTIONS } from "./workos_audit";

const SCHEMAS_DIR = path.resolve(__dirname, "../../../admin/audit_log_schemas");
const FRONT_DIR = path.resolve(__dirname, "../../..");

const SchemaFileValidator = z.object({
  action: z.string(),
  targets: z.array(z.object({ type: z.string() })),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
type SchemaFile = z.infer<typeof SchemaFileValidator>;

function readSchemaFile(filePath: string): SchemaFile {
  return SchemaFileValidator.parse(
    JSON.parse(fs.readFileSync(filePath, "utf-8"))
  );
}

function readSchemaByAction(action: string): SchemaFile {
  return readSchemaFile(path.join(SCHEMAS_DIR, `${action}.json`));
}

describe("audit log schemas", () => {
  it("every AuditAction has a corresponding schema JSON file", () => {
    const missing: string[] = [];
    for (const action of AUDIT_ACTIONS) {
      const filePath = path.join(SCHEMAS_DIR, `${action}.json`);
      if (!fs.existsSync(filePath)) {
        missing.push(action);
      }
    }
    expect(
      missing,
      `Missing schema files in front/admin/audit_log_schemas/ for: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("no orphan schema files — every JSON file maps to a valid AuditAction", () => {
    const validActions = new Set<string>(AUDIT_ACTIONS);
    const orphans: string[] = [];
    for (const file of fs.readdirSync(SCHEMAS_DIR)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const schema = readSchemaFile(path.join(SCHEMAS_DIR, file));
      if (!validActions.has(schema.action)) {
        orphans.push(file);
      }
    }
    expect(
      orphans,
      `Orphan schema files (action not in AuditAction union): ${orphans.join(", ")}`
    ).toEqual([]);
  });

  it("schema file basename matches its 'action' field", () => {
    const mismatched: string[] = [];
    for (const file of fs.readdirSync(SCHEMAS_DIR)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const schema = readSchemaFile(path.join(SCHEMAS_DIR, file));
      const expected = `${schema.action}.json`;
      if (expected !== file) {
        mismatched.push(`${file} declares action "${schema.action}"`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("all schema metadata keys are snake_case per [AUDIT9]", () => {
    // snake_case = lowercase letters, digits, and underscores only, must start
    // with a letter. Rejects camelCase, PascalCase, kebab-case, and
    // SCREAMING_SNAKE_CASE.
    const snakeCaseRegex = /^[a-z][a-z0-9_]*$/;
    const violations: string[] = [];

    for (const file of fs.readdirSync(SCHEMAS_DIR)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const schema = readSchemaFile(path.join(SCHEMAS_DIR, file));
      if (!schema.metadata) {
        continue;
      }
      for (const key of Object.keys(schema.metadata)) {
        if (!snakeCaseRegex.test(key)) {
          violations.push(`${file}: "${key}"`);
        }
      }
    }
    expect(
      violations,
      `Non-snake_case metadata keys (per [AUDIT9]):\n${violations.join("\n")}`
    ).toEqual([]);
  });
});

/**
 * Collects every (action, targetTypes[]) pair found in `emitAuditLogEvent` /
 * `emitAuditLogEventDirect` call sites under front/. Uses brace-depth tracking
 * to extract the argument object, then regex to pull out the action and target
 * types from `buildAuditLogTarget("<type>", ...)` and `{ type: "<type>" }`
 * literals.
 *
 * This is intentionally a syntactic scan, not a full AST parse — partial
 * coverage is fine. False negatives just mean a future drift isn't caught
 * here; false positives mean a noisy test. The recovery rule is: bail on the
 * site (don't fail the test) if extraction is ambiguous.
 */
type EmitSite = {
  file: string;
  action: string;
  targetTypes: string[];
  unextractable?: boolean;
};

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".next" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      results.push(...listTsFiles(full));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      results.push(full);
    }
  }
  return results;
}

function extractBalanced(source: string, startIdx: number): string | null {
  // startIdx points at the opening '{'. Returns the substring INSIDE the braces
  // (exclusive of the outer { }), or null if no balanced match.
  if (source[startIdx] !== "{") {
    return null;
  }
  let depth = 0;
  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx + 1, i);
      }
    }
  }
  return null;
}

function collectEmitSites(): EmitSite[] {
  const sites: EmitSite[] = [];
  const callRegex = /emitAuditLogEvent(?:Direct)?\s*\(\s*\{/g;
  const actionRegex = /\baction:\s*"([^"]+)"/;
  const targetsArrayRegex = /\btargets:\s*\[([\s\S]*?)\]/g;
  // `buildAuditLogTarget("xxx", ...)` is only ever used to construct audit
  // targets in this codebase, so scanning the entire emit body for it is safe
  // and lets us capture dynamic patterns like `targets: arr.map(r => buildAuditLogTarget("user", r))`.
  const buildTargetRegex = /buildAuditLogTarget\(\s*"([^"]+)"/g;
  // Literal target objects shaped like `{ type: "xxx", id: ... }` (note the
  // required `id:` after the type, which excludes actor/metadata objects that
  // happen to use a `type:` key).
  const literalTargetRegex = /\{\s*type:\s*"([^"]+)"\s*,\s*id:/g;

  for (const file of listTsFiles(FRONT_DIR)) {
    let source: string;
    try {
      source = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (!source.includes("emitAuditLogEvent")) {
      continue;
    }
    let match: RegExpExecArray | null;
    while ((match = callRegex.exec(source)) !== null) {
      const braceIdx = match.index + match[0].length - 1;
      const body = extractBalanced(source, braceIdx);
      if (!body) {
        continue;
      }
      const actionMatch = actionRegex.exec(body);
      if (!actionMatch) {
        continue;
      }
      const action = actionMatch[1];

      const targetTypes: string[] = [];

      // 1. Scan the entire body for buildAuditLogTarget(...) calls.
      let bt: RegExpExecArray | null;
      while ((bt = buildTargetRegex.exec(body)) !== null) {
        targetTypes.push(bt[1]);
      }
      buildTargetRegex.lastIndex = 0;

      // 2. Scan only inside `targets: [...]` arrays for literal target objects.
      //    Restricting to the array literal avoids false positives from the
      //    sibling `actor: { type: "user", id: ... }` field.
      let ta: RegExpExecArray | null;
      while ((ta = targetsArrayRegex.exec(body)) !== null) {
        let lt: RegExpExecArray | null;
        while ((lt = literalTargetRegex.exec(ta[1])) !== null) {
          targetTypes.push(lt[1]);
        }
        literalTargetRegex.lastIndex = 0;
      }
      targetsArrayRegex.lastIndex = 0;

      sites.push({
        file: path.relative(FRONT_DIR, file),
        action,
        targetTypes,
        unextractable: targetTypes.length === 0,
      });
    }
  }
  return sites;
}

describe("audit log emit call sites", () => {
  const sites = collectEmitSites();

  it("found at least one emit call site (sanity check)", () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it("every detected emit site has extractable target types", () => {
    // If the regex cannot extract any target types from an emit call, the
    // schema/code drift check silently passes for that action. Fail loudly so
    // the regex (or the call site) gets adjusted instead of allowing silent
    // drift to creep in via unusual emit shapes.
    const unextractable = sites
      .filter((s) => s.unextractable)
      .map((s) => `${s.file}: action "${s.action}"`);
    expect(
      unextractable,
      `Emit sites where the target-extraction regex found no targets ` +
        `(possible new emit pattern):\n${unextractable.join("\n")}`
    ).toEqual([]);
  });

  it("every emit call's targets match the schema for that action", () => {
    const mismatches: string[] = [];
    const schemaCache = new Map<string, SchemaFile>();

    for (const site of sites) {
      if (site.unextractable) {
        continue;
      }
      let schema = schemaCache.get(site.action);
      if (!schema) {
        try {
          schema = readSchemaByAction(site.action);
          schemaCache.set(site.action, schema);
        } catch {
          mismatches.push(
            `${site.file}: action "${site.action}" has no schema file`
          );
          continue;
        }
      }
      // WorkOS schemas declare the *set* of allowed target types — an emit
      // can include multiple targets of the same type (e.g. user.identity_merged
      // sends two user targets) without the schema repeating the type, but
      // the set of distinct types must match exactly. Subset emits are not
      // allowed: if we cannot send a target the schema declares, the schema
      // must be changed (or the emit guarded so it only fires when every
      // declared target is available).
      const schemaTypes = new Set(schema.targets.map((t) => t.type));
      const emitTypes = new Set(site.targetTypes);
      const missingFromSchema = [...emitTypes].filter(
        (t) => !schemaTypes.has(t)
      );
      const unusedInSchema = [...schemaTypes].filter((t) => !emitTypes.has(t));
      if (missingFromSchema.length > 0 || unusedInSchema.length > 0) {
        mismatches.push(
          `${site.file}: action "${site.action}" emits targets ` +
            `[${site.targetTypes.join(", ")}] but schema declares ` +
            `[${[...schemaTypes].join(", ")}]`
        );
      }
    }

    expect(
      mismatches,
      `Audit log emit/schema drift:\n${mismatches.join("\n")}`
    ).toEqual([]);
  });
});
