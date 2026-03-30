/**
 * Register audit log event schemas with WorkOS.
 *
 * WorkOS requires event schemas to be pre-registered before events can be emitted.
 * Schemas are loaded from JSON files in front/admin/audit_log_schemas/.
 *
 * Usage:
 *   npx tsx front/admin/register_audit_log_schemas.ts                          # preview all (dry-run)
 *   npx tsx front/admin/register_audit_log_schemas.ts --execute                # register all
 *   npx tsx front/admin/register_audit_log_schemas.ts --changed                # preview only new/modified schemas
 *   npx tsx front/admin/register_audit_log_schemas.ts --execute --changed      # register only new/modified schemas
 *   npx tsx front/admin/register_audit_log_schemas.ts user.login               # preview specific actions
 *   npx tsx front/admin/register_audit_log_schemas.ts --execute user.login     # register specific actions
 */

import { getWorkOS } from "@app/lib/api/workos/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkOS } from "@workos-inc/node";
import { execFileSync } from "child_process";
import * as fs from "fs/promises";
import minimist from "minimist";
import * as path from "path";
import { z } from "zod";

type CreateAuditLogSchemaOptions = Parameters<
  WorkOS["auditLogs"]["createSchema"]
>[0];

const SCHEMAS_DIR = path.join(__dirname, "audit_log_schemas");

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.boolean(), z.number()])
);

const auditLogSchemaValidator = z.object({
  action: z.string().min(1, "action must be a non-empty string"),
  targets: z
    .array(
      z.object({
        type: z.string().min(1, "target type must be a non-empty string"),
        metadata: metadataSchema.optional(),
      })
    )
    .min(1, "targets must be a non-empty array"),
  actor: z
    .object({
      metadata: metadataSchema,
    })
    .optional(),
  metadata: metadataSchema.optional(),
});

function getChangedSchemaFiles(): Set<string> {
  const diff = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=AM",
      "origin/main",
      "--",
      SCHEMAS_DIR,
    ],
    { encoding: "utf-8" }
  ).trim();

  if (!diff) {
    return new Set();
  }

  return new Set(diff.split("\n").map((f) => path.basename(f)));
}

async function loadSchemas(
  args: minimist.ParsedArgs
): Promise<CreateAuditLogSchemaOptions[]> {
  const isChanged = !!args.changed;
  const actions = args._.map(String);

  const changedFiles = isChanged ? getChangedSchemaFiles() : null;

  let files = (await fs.readdir(SCHEMAS_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (changedFiles) {
    files = files.filter((f) => changedFiles.has(f));
  }

  const schemas: CreateAuditLogSchemaOptions[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(SCHEMAS_DIR, file), "utf-8");
    const parsed: unknown = JSON.parse(content);

    const result = auditLogSchemaValidator.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid schema in ${file}: ${result.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    schemas.push(result.data);
  }

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
  const args = minimist(process.argv.slice(2), {
    boolean: ["execute", "changed"],
  });
  const execute = !!args.execute;
  const schemas = await loadSchemas(args);

  if (schemas.length === 0) {
    console.log("No schemas to register.");
    return;
  }

  if (!execute) {
    for (const schema of schemas) {
      const file = `admin/audit_log_schemas/${schema.action}.json`;
      console.log(`Would register schema: ${schema.action} (${file})`);
    }
    console.log(
      `\n${schemas.length} schema(s) would be registered. Pass --execute to register.`
    );
    return;
  }

  const workos = getWorkOS();

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

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", normalizeError(error).message);
  process.exit(1);
});
