/**
 *
 * Every Zod schema from `@dust-tt/client` that a `/v1` route handler imports
 * (request or response) must be free of `ModelIdSchema` references as per cc string-ids-in-api-interfaces.
 * Existing violations are tracked in `KNOWN_VIOLATIONS`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";

import * as allExports from "./types";
import { ModelIdSchema } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod internals
type ZodDef = any;

const MODEL_ID_REF: ZodTypeAny = ModelIdSchema;

const V1_ROUTE_DIRS = [
  path.resolve(__dirname, "../../../front-api/routes/v1"),
  path.resolve(__dirname, "../../../front-api/routes/sse/v1"),
];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...findTsFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      results.push(full);
    }
  }
  return results;
}

function extractClientSchemaNames(files: string[]): Set<string> {
  const names = new Set<string>();
  const importRe =
    /(?:import|export)\s+(?:type\s+)?{([^}]+)}\s+from\s+["']@dust-tt\/client["']/g;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(importRe)) {
      for (const token of match[1].split(",")) {
        const name = token.replace(/\s+as\s+\w+/, "").trim();
        const schemaName = name.replace(/Type$/, "Schema");
        if (schemaName.endsWith("Schema") && schemaName in allExports) {
          names.add(schemaName);
        }
      }
    }
  }
  return names;
}

// Known violations — "SchemaName > dotted.field.path".
const KNOWN_VIOLATIONS = new Set([
  // DataSource / DataSourceView
  "GetDataSourcesResponseSchema > data_sources[].id",
  "DataSourceViewResponseSchema > dataSourceView.id",
  "DataSourceViewResponseSchema > dataSourceView.dataSource.id",
  "SearchDataSourceViewsResponseSchema > data_source_views[].id",
  "SearchDataSourceViewsResponseSchema > data_source_views[].dataSource.id",
  "UpsertFolderResponseSchema > data_source.id",

  // AgentConfiguration
  "GetOrPatchAgentConfigurationResponseSchema > agentConfiguration.id",
  "GetOrPatchAgentConfigurationResponseSchema > agentConfiguration.versionAuthorId",
  "ImportAgentConfigurationFromYAMLResponseSchema > agentConfiguration.id",
  "ImportAgentConfigurationFromYAMLResponseSchema > agentConfiguration.versionAuthorId",
  "GetAgentConfigurationsResponseSchema > agentConfigurations[].id",
  "GetAgentConfigurationsResponseSchema > agentConfigurations[].versionAuthorId",

  // Messages
  "RetryMessageResponseSchema > message.id",
  "RetryMessageResponseSchema > message.agentMessageId",
  "RetryMessageResponseSchema > message.configuration.id",
  "RetryMessageResponseSchema > message.configuration.versionAuthorId",
  "RetryMessageResponseSchema > message.actions[].id",
  "RetryMessageResponseSchema > message.actions[].agentMessageId",

  // User / Workspace
  "MeResponseSchema > user.id",
  "MeResponseSchema > user.workspaces[].id",

  // Apps
  "GetAppsResponseSchema > apps[].id",
  "PostAppsRequestSchema > apps[].id",

  // Search
  "PostWorkspaceSearchResponseBodySchema > nodes[].dataSource.id",
  "PostWorkspaceSearchResponseBodySchema > nodes[].dataSourceViews[].id",

  // Feedbacks
  "GetFeedbacksResponseSchema > feedbacks[].agentMessageId",
  "GetFeedbacksResponseSchema > feedbacks[].userId",

  // Triggers
  "GetTriggersResponseSchema > triggers[].id",
  "GetTriggerResponseSchema > trigger.id",
  "TriggerSchema > id",

  // MCP
  "GetMCPServerViewsResponseSchema > serverViews[].id",
]);

// Zod schema walker — finds fields that are ModelIdSchema.
function unwrapZod(schema: ZodTypeAny): ZodTypeAny {
  const def: ZodDef = schema._def;
  const typeName: string | undefined = def?.typeName;
  if (
    typeName === "ZodOptional" ||
    typeName === "ZodNullable" ||
    typeName === "ZodDefault" ||
    typeName === "ZodReadonly"
  ) {
    return unwrapZod(def.innerType);
  }
  if (typeName === "ZodEffects") {
    return unwrapZod(def.schema);
  }
  if (typeName === "ZodLazy") {
    return unwrapZod(def.getter());
  }
  return schema;
}

function getShape(def: ZodDef): Record<string, ZodTypeAny> {
  if (typeof def.shape === "function") {
    return def.shape();
  }
  return (def.shape as Record<string, ZodTypeAny>) ?? {};
}

function findModelIdUsages(
  schema: ZodTypeAny,
  fieldPath: string,
  violations: Set<string>,
  visited: Set<ZodTypeAny>
): void {
  const unwrapped = unwrapZod(schema);

  if (unwrapped === MODEL_ID_REF) {
    violations.add(fieldPath || "(root)");
    return;
  }

  if (visited.has(schema) || visited.has(unwrapped)) {
    return;
  }
  visited.add(schema);
  visited.add(unwrapped);

  const def: ZodDef = unwrapped._def;
  const typeName: string | undefined = def?.typeName;

  if (typeName === "ZodObject") {
    for (const [key, value] of Object.entries(getShape(def))) {
      const child = value as ZodTypeAny;
      const childPath = fieldPath ? `${fieldPath}.${key}` : key;
      findModelIdUsages(child, childPath, violations, visited);
    }
  } else if (typeName === "ZodArray") {
    findModelIdUsages(def.type, fieldPath + "[]", violations, visited);
  } else if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") {
    const options: ZodTypeAny[] = def.options ?? [];
    for (const option of options) {
      findModelIdUsages(option, fieldPath, violations, new Set());
    }
  } else if (typeName === "ZodIntersection") {
    findModelIdUsages(def.left, fieldPath, violations, visited);
    findModelIdUsages(def.right, fieldPath, violations, visited);
  } else if (typeName === "ZodRecord") {
    findModelIdUsages(def.valueType, fieldPath + "[]", violations, visited);
  } else if (typeName === "ZodTuple") {
    const items: ZodTypeAny[] = def.items ?? [];
    for (const item of items) {
      findModelIdUsages(item, fieldPath + "[]", violations, visited);
    }
  }
}

describe("No ModelId in public API (v1) schemas", () => {
  const v1Files = V1_ROUTE_DIRS.flatMap(findTsFiles);
  const v1SchemaNames = extractClientSchemaNames(v1Files);

  const schemasToCheck: Array<{ name: string; schema: ZodTypeAny }> = [];
  for (const name of v1SchemaNames) {
    const schema = (allExports as Record<string, unknown>)[name];
    if (schema && typeof schema === "object" && "_def" in schema) {
      schemasToCheck.push({ name, schema: schema as ZodTypeAny });
    }
  }
  schemasToCheck.sort((a, b) => a.name.localeCompare(b.name));

  it("discovers v1 route files and their SDK schema imports", () => {
    expect(v1Files.length).toBeGreaterThan(0);
    expect(v1SchemaNames.size).toBeGreaterThan(0);
    expect(schemasToCheck.length).toBeGreaterThan(0);
  });

  it("ModelIdSchema reference was extracted successfully", () => {
    expect(MODEL_ID_REF._def.typeName).toBe("ZodNumber");
  });

  it("has no ModelIdSchema fields outside the known-violations allowlist", () => {
    const unexpected: string[] = [];

    for (const { name, schema } of schemasToCheck) {
      const violations = new Set<string>();
      findModelIdUsages(schema, "", violations, new Set());

      for (const fp of violations) {
        const key = `${name} > ${fp}`;
        if (!KNOWN_VIOLATIONS.has(key)) {
          unexpected.push(key);
        }
      }
    }

    if (unexpected.length > 0) {
      expect.fail(
        `New ModelIdSchema fields in v1 API schemas (violates string-ids-in-api-interfaces contract):\n` +
          unexpected.map((v) => `  - ${v}`).join("\n") +
          `\n\nReplace with sId (string).`
      );
    }
  });

  it("known-violations list has no stale entries", () => {
    const actualViolations = new Set<string>();

    for (const { name, schema } of schemasToCheck) {
      const violations = new Set<string>();
      findModelIdUsages(schema, "", violations, new Set());
      for (const fp of violations) {
        actualViolations.add(`${name} > ${fp}`);
      }
    }

    const stale = [...KNOWN_VIOLATIONS].filter((k) => !actualViolations.has(k));
    if (stale.length > 0) {
      expect.fail(
        `These known violations no longer exist — remove them from the allowlist:\n` +
          stale.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});
