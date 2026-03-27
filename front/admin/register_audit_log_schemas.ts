/**
 * Register audit log event schemas with WorkOS.
 *
 * WorkOS requires event schemas to be pre-registered before events can be emitted.
 * Schemas are loaded from JSON files in front/admin/audit_log_schemas/.
 *
 * Usage:
 *   npx tsx front/admin/register_audit_log_schemas.ts                # register all
 *   npx tsx front/admin/register_audit_log_schemas.ts --changed      # only new/modified schemas (vs origin/main)
 *   npx tsx front/admin/register_audit_log_schemas.ts user.login     # register specific actions
 */

import { getWorkOS } from "@app/lib/api/workos/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkOS } from "@workos-inc/node";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

type CreateAuditLogSchemaOptions = Parameters<
  WorkOS["auditLogs"]["createSchema"]
>[0];

const SCHEMAS_DIR = path.join(__dirname, "audit_log_schemas");

function getChangedSchemaFiles(): Set<string> {
  const diff = execSync(
    `git diff --name-only --diff-filter=AM origin/main -- "${SCHEMAS_DIR}"`,
    { encoding: "utf-8" }
  ).trim();

  if (!diff) {
    return new Set();
  }

  return new Set(diff.split("\n").map((f) => path.basename(f)));
}

function loadSchemas(args: string[]): CreateAuditLogSchemaOptions[] {
  const isChanged = args.includes("--changed");
  const actions = args.filter((a) => a !== "--changed");

  const changedFiles = isChanged ? getChangedSchemaFiles() : null;

  let files = fs
    .readdirSync(SCHEMAS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (changedFiles) {
    files = files.filter((f) => changedFiles.has(f));
  }

  // JSON.parse returns `any`, which is assignable to CreateAuditLogSchemaOptions.
  const schemas: CreateAuditLogSchemaOptions[] = files.map((file) => {
    const content = fs.readFileSync(path.join(SCHEMAS_DIR, file), "utf-8");
    return JSON.parse(content);
  });

  if (actions.length > 0) {
    const filtered = schemas.filter((s) => actions.includes(s.action));
    const found = new Set(filtered.map((s) => s.action));
    const missing = actions.filter((a) => !found.has(a));
    if (missing.length > 0) {
      throw new Error(`No schema files found for: ${missing.join(", ")}`);
    }
    return filtered;
  }

  return schemas;
}

async function main() {
  const args = process.argv.slice(2);
  const schemas = loadSchemas(args);
  const workos = getWorkOS();

  if (schemas.length === 0) {
    console.log("No schemas to register.");
    return;
  }

  console.log(`Registering ${schemas.length} schema(s)\n`);
  let success = 0;
  let failed = 0;

  for (const schema of schemas) {
    const { action } = schema;
    try {
      const result = await workos.auditLogs.createSchema(schema);
      console.log(`  OK  ${action} (v${result.version})`);
      success++;
    } catch (error: unknown) {
      console.error(`  FAIL  ${action}: ${normalizeError(error).message}`);
      failed++;
    }
  }

  console.log(
    `\nDone: ${success} registered, ${failed} failed, ${schemas.length} total`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", normalizeError(error).message);
  process.exit(1);
});
