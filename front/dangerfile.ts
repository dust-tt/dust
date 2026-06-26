import { danger, fail, warn } from "danger";
import fs from "fs";

const sdkAckLabel = "sdk-ack";
const migrationAckLabel = "migration-ack";
const documentationAckLabel = "documentation-ack";
const rawSqlAckLabel = "raw-sql-ack";
const sparkleVersionAckLabel = "sparkle-version-ack";
const sseAckLabel = "sse-ack";
const sandboxImageAckLabel = "sandbox-image-ack";
const auditLogAckLabel = "audit-log-ack";
const marketingSnapshotAckLabel = "marketing-snapshot-ack";

const REMOVE_INDEX_WARNING =
  "\n\nBefore deleting an index, make sure it is actually not used by running:" +
  "\n```sql" +
  "\nSELECT s.relname AS table_name," +
  "\n       indexrelname AS index_name," +
  "\n       i.indisunique," +
  "\n       idx_scan AS index_scans" +
  "\nFROM   pg_catalog.pg_stat_user_indexes s," +
  "\n       pg_index i" +
  "\nWHERE  i.indexrelid = s.indexrelid;" +
  "\n```";

const hasLabel = (label: string) => {
  return danger.github.issue.labels.some((l) => l.name === label);
};

function failMigrationAck() {
  fail(
    "Files in `**/models/` have been modified. " +
      `Addition and deletion should be in 2 separate PRs:\n` +
      ` 1. Addition: migrate and deploy\n` +
      ` 2. Deletion: deploy and migrate\n\n` +
      `Please add the \`${migrationAckLabel}\` label to acknowledge ` +
      `that a migration will be needed once merged into 'main'.` +
      REMOVE_INDEX_WARNING
  );
}

function warnMigrationAck(migrationAckLabel: string) {
  warn(
    "Files in `**/lib/models/` have been modified and the PR has the `" +
      migrationAckLabel +
      "` label. Don't forget to run the migration from prodbox." +
      REMOVE_INDEX_WARNING
  );
}

function checkMigrationLabel() {
  if (!hasLabel(migrationAckLabel)) {
    failMigrationAck();
  } else {
    warnMigrationAck(migrationAckLabel);
  }
}

function failSSEEndpointAck() {
  fail(
    "SSE endpoint files have been modified. These endpoints are served by " +
      "both `front` and `front-sse` pods (via `/api/sse/` re-exports).\n\n" +
      `Please add the \`${sseAckLabel}\` label to acknowledge ` +
      "that a `front-sse` deploy is required alongside the `front` deploy."
  );
}

function warnSSEEndpointAck(sseAckLabel: string) {
  warn(
    "SSE endpoint files have been modified and the PR has the `" +
      sseAckLabel +
      "` label. Don't forget to deploy `front-sse` alongside `front`."
  );
}

function checkSSEEndpointLabel() {
  if (!hasLabel(sseAckLabel)) {
    failSSEEndpointAck();
  } else {
    warnSSEEndpointAck(sseAckLabel);
  }
}

function failSSESharedFilesAck() {
  fail(
    "`front/lib/auth.ts` (Authenticator) has been modified. This code runs " +
      "on `front-sse` pods as well.\n\n" +
      `Please add the \`${sseAckLabel}\` label to acknowledge ` +
      "that a `front-sse` deploy is required alongside the `front` deploy."
  );
}

function warnSSESharedFilesAck(sseAckLabel: string) {
  warn(
    "`front/lib/auth.ts` (Authenticator) has been modified and the PR has the `" +
      sseAckLabel +
      "` label. Don't forget to deploy `front-sse` alongside `front`."
  );
}

function checkSSESharedFilesLabel() {
  if (!hasLabel(sseAckLabel)) {
    failSSESharedFilesAck();
  } else {
    warnSSESharedFilesAck(sseAckLabel);
  }
}

function failSSESharedModelsAck() {
  fail(
    "Models queried by SSE endpoints have been modified. These models are " +
      "loaded by code that runs on `front-sse` pods as well.\n\n" +
      `Please add the \`${sseAckLabel}\` label to acknowledge ` +
      "that a `front-sse` deploy is required alongside the `front` deploy."
  );
}

function warnSSESharedModelsAck(sseAckLabel: string) {
  warn(
    "Models queried by SSE endpoints have been modified and the PR has the `" +
      sseAckLabel +
      "` label. Don't forget to deploy `front-sse` alongside `front`."
  );
}

function checkSSESharedModelsLabel() {
  if (!hasLabel(sseAckLabel)) {
    failSSESharedModelsAck();
  } else {
    warnSSESharedModelsAck(sseAckLabel);
  }
}

function failSDKAck() {
  fail(
    "Files in `**/sdks/js/` have been modified. " +
      `Changing the types defined in the SDK could break existing client.\n` +
      `Additions (new types, new values) are generally fine but **removals are NOT OK** : it would break the contract of the Public API.\n` +
      `Please add the \`${sdkAckLabel}\` label to acknowledge ` +
      `that your are not breaking the existing Public API contract.`
  );
}

function checkSDKLabel() {
  if (!hasLabel(sdkAckLabel)) {
    failSDKAck();
  }
}

function checkDeployPlanSection() {
  const PRDescription = danger.github.pr.body;

  const deployPlanSectionRegex =
    /## Deploy Plan.*?\r\n([\s\S]*?)(?=<!--|\n##|$)/;

  const match = PRDescription.match(deployPlanSectionRegex);
  if (!match || match[1].trim().length < 20) {
    fail(
      "Please include a detailed Deploy Plan section in your PR description, at least 20 characters long."
    );
  }
}

function checkDocumentationLabel() {
  if (!hasLabel(documentationAckLabel)) {
    failDocumentationAck();
  } else {
    warnDocumentationAck(documentationAckLabel);
  }
}

function failDocumentationAck() {
  fail(
    "Files in `front-api/routes/` have been modified. " +
      `Please add the \`${documentationAckLabel}\` label to acknowledge that if anything changes
      in a documented endpoint, you need to edit the JSDoc comment
      above the handler definition and/or the swagger_schemas.ts file and regenerate the documentation using \`npm -w front-api run docs\``
  );
}

function warnDocumentationAck(documentationAckLabel: string) {
  warn(
    "Files in `front-api/routes/` have been modified and the PR has the `" +
      documentationAckLabel +
      "` label. \n" +
      "Don't forget to run `npm -w front-api run docs` and use the `Deploy OpenAPI Docs` Github action to update https://docs.dust.tt/reference."
  );
}

function checkAppsRegistry() {
  warn(
    `File \`front/lib/registry.ts\` has been modified.
    Please check [Runbook: Update Assistant dust-apps](https://www.notion.so/dust-tt/Runbook-Update-Assistant-dust-apps-18c28599d94180d78dabe92f445157a8)
    `
  );
}

async function checkSparkleVersionConsistency() {
  const frontPackageJsonDiff =
    await danger.git.diffForFile("front/package.json");

  const extensionPackageJsonDiff = await danger.git.diffForFile(
    "extension/package.json"
  );

  if (!frontPackageJsonDiff && !extensionPackageJsonDiff) {
    return;
  }

  const frontPackageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  const extensionPackageJson = JSON.parse(
    fs.readFileSync("../extension/package.json", "utf8")
  );

  const frontVersion = frontPackageJson.dependencies?.["@dust-tt/sparkle"];
  const extensionVersion =
    extensionPackageJson.dependencies?.["@dust-tt/sparkle"];

  if (!frontVersion || !extensionVersion) {
    return;
  }

  const normalizeVersion = (v: string) => v.replace(/^[~^]/, "");

  if (normalizeVersion(frontVersion) !== normalizeVersion(extensionVersion)) {
    const message = `Sparkle versions must be kept in sync:\n- front: ${frontVersion}\n- extension: ${extensionVersion}`;

    if (hasLabel(sparkleVersionAckLabel)) {
      warn(
        `${message}\nPR has "${sparkleVersionAckLabel}" label. Ensure both are updated together.`
      );
    } else {
      fail(`${message}\nUpdate both or add "${sparkleVersionAckLabel}" label.`);
    }
  }
}

/**
 * Check if added lines have raw SQL
 */
async function checkRawSqlRegistry(filePaths: string[]) {
  const sqlPatterns = [
    /\b(SELECT|SELECT\s+DISTINCT)\s+.+?\s+FROM\s+[^\s;]+(WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)?/i,
    /\bINSERT\s+INTO\s+[^\s;]+\s+(\([^)]+\)\s+)?VALUES\s*\(/i,
    /\bUPDATE\s+[^\s;]+\s+SET\s+[^\s;]+(WHERE|RETURNING)?/i,
    /\bDELETE\s+FROM\s+[^\s;]+(WHERE|RETURNING)?/i,
  ];

  const filesWithRawSql: string[] = [];

  // Check each file for raw SQL
  await Promise.all(
    filePaths.map(async (file) => {
      try {
        const content = await danger.git.diffForFile(file);

        if (content !== null) {
          // Check if the file contains raw SQL
          if (sqlPatterns.some((pattern) => pattern.test(content.added))) {
            filesWithRawSql.push(file);
          }
        }
      } catch (error) {
        console.error(`Error checking file ${file}:`, error);
      }
    })
  );

  if (filesWithRawSql.length > 0) {
    if (hasLabel(rawSqlAckLabel)) {
      for (const file of filesWithRawSql) {
        warn(`File "${file}" has been modified and contains raw sql code.`);
      }
    } else {
      for (const file of filesWithRawSql) {
        fail(
          `File "${file}" has been modified and contains raw sql code. Please add "${rawSqlAckLabel}" label and verify that those query cannot be made without Sequelize Model.`
        );
      }
    }
  }
}

/**
 * Check if added lines contain new WorkspaceAwareModel definitions
 */
async function checkWorkspaceAwareModels(filePaths: string[]) {
  const workspaceAwarePatterns = [
    /extends\s+WorkspaceAwareModel/,
    /extends\s+SoftDeletableWorkspaceAwareModel/,
  ];

  const filesWithNewModels: string[] = [];

  await Promise.all(
    filePaths.map(async (file) => {
      try {
        const content = await danger.git.diffForFile(file);

        if (
          content !== null &&
          workspaceAwarePatterns.some((pattern) => pattern.test(content.added))
        ) {
          filesWithNewModels.push(file);
        }
      } catch (error) {
        console.error(`Error checking file ${file}:`, error);
      }
    })
  );

  if (filesWithNewModels.length > 0) {
    for (const file of filesWithNewModels) {
      warn(
        `File "${file}" introduces a new WorkspaceAwareModel or SoftDeletableWorkspaceAwareModel. ` +
          `Please ensure it is included in workspace/space deletion workflow to avoid crashing temporal.`
      );
    }
  }
}

function failSandboxImageAck() {
  fail(
    "Files in `front/lib/api/sandbox/image/` have been modified. " +
      "Live sandboxes pin the registered (baseImage, version) tuple at " +
      "creation time, so any image change must be paired with:\n" +
      "  1. A bump to the corresponding image `tag` in the registry " +
      "(e.g. `DUST_BASE_IMAGE_VERSION`).\n" +
      "  2. After deploy, opening `/poke/kill` (Kill Switches) and " +
      "requesting a kill of older versions for the affected image so " +
      "existing conversations get fresh sandboxes.\n\n" +
      `Please add the \`${sandboxImageAckLabel}\` label to acknowledge ` +
      "that both steps will be done."
  );
}

function warnSandboxImageAck() {
  warn(
    "Files in `front/lib/api/sandbox/image/` have been modified and the " +
      `PR has the \`${sandboxImageAckLabel}\` label. After deploy, open ` +
      "`/poke/kill` (Kill Switches) and trigger a kill request for the " +
      "affected image so existing conversations recreate against the new " +
      "version."
  );
}

function checkSandboxImageLabel() {
  if (!hasLabel(sandboxImageAckLabel)) {
    failSandboxImageAck();
  } else {
    warnSandboxImageAck();
  }
}

/**
 * Triggers related checks based on modified files
 */
function warnTriggersWorkflowChanges() {
  warn(
    `Files in \`front/temporal/agent_schedules/\` have been modified.
    Be careful modifying workflows/activities signatures.
    This may break running schedules. If so, soft reset them from prodbox.`
  );
}

const AUDIT_SCHEMAS_PREFIX = "front/admin/audit_log_schemas/";
const AUDIT_VERSION_MAP_REPO_PATH = "front/lib/api/audit/schema_versions.json";
const AUDIT_VERSION_MAP_LOCAL_PATH = "lib/api/audit/schema_versions.json";

// Parses a schema_versions.json blob into an action -> version map. Returns an
// empty map for missing/unparseable content (e.g. the base ref before the file
// existed) so callers can treat unknown actions as "no prior version".
function parseVersionMap(content: string | null | undefined): {
  [action: string]: number;
} {
  if (!content) {
    return {};
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function failAuditSchemaVersions(violations: string[]) {
  fail(
    "Audit log schema(s) changed but the version in " +
      `\`${AUDIT_VERSION_MAP_REPO_PATH}\` was not bumped:\n` +
      violations.map((v) => `- ${v}`).join("\n") +
      "\n\nRun `npx tsx front/admin/register_audit_log_schemas.ts --execute " +
      "--changed` to register the updated schema(s) with WorkOS, then commit " +
      "the regenerated `schema_versions.json` in this PR. WorkOS validates " +
      "each event against the version we send, so a stale version causes " +
      "validation failures once deployed.\n\nIf the change is a no-op that " +
      `WorkOS treats as identical (no new version created), add the ` +
      `\`${auditLogAckLabel}\` label to override.`
  );
}

function warnAuditSchemaVersions(violations: string[]) {
  warn(
    "Audit log schema(s) changed without a version bump, and the " +
      `\`${auditLogAckLabel}\` label is set:\n` +
      violations.map((v) => `- ${v}`).join("\n") +
      "\nEnsure WorkOS genuinely treats the change as identical."
  );
}

// When a schema file under `front/admin/audit_log_schemas/` changes, its
// version in `schema_versions.json` must be bumped (WorkOS bumps it when the
// registration script re-registers a changed schema). We compare the version
// on this branch against the base ref; a missing or non-incremented version
// means the registration step was skipped.
async function checkAuditSchemaVersions(changedActions: string[]) {
  let headMap: { [action: string]: number };
  try {
    headMap = parseVersionMap(
      fs.readFileSync(AUDIT_VERSION_MAP_LOCAL_PATH, "utf8")
    );
  } catch {
    // Version map unreadable — the vitest consistency test covers presence;
    // nothing to diff against here.
    return;
  }

  // Danger runs with cwd=`front/`; `danger.git.*` paths are repo-root relative.
  const versionDiff = await danger.git.diffForFile(AUDIT_VERSION_MAP_REPO_PATH);
  // If the map wasn't touched in this PR, the base equals head, so any changed
  // schema will correctly read as "not incremented".
  const baseMap = versionDiff ? parseVersionMap(versionDiff.before) : headMap;

  const violations: string[] = [];
  for (const action of changedActions) {
    const headVersion = headMap[action];
    const baseVersion = baseMap[action];
    if (typeof headVersion !== "number") {
      violations.push(`\`${action}\` has no entry in schema_versions.json`);
    } else if (typeof baseVersion === "number" && headVersion <= baseVersion) {
      violations.push(
        `\`${action}\` is still at v${headVersion} (schema changed but version not incremented)`
      );
    }
  }

  if (violations.length === 0) {
    return;
  }

  if (hasLabel(auditLogAckLabel)) {
    warnAuditSchemaVersions(violations);
  } else {
    failAuditSchemaVersions(violations);
  }
}

// The `/home/api-pricing` page is served by the `marketing` workspace, which
// cannot import front's model/pricing modules (they pull in a deep dependency
// graph: io-ts, zod, GCS-generated custom models, ...). Instead, marketing keeps
// hand-maintained snapshots of the data the page needs. When the front sources
// of truth change, those snapshots must be re-synced or the page silently
// renders stale/incomplete prices.
const MARKETING_SNAPSHOT_FILES = [
  "marketing/lib/api/assistant/token_pricing.ts",
  "marketing/types/assistant/models/models.ts",
  "marketing/types/assistant/models/providers.ts",
  "marketing/types/assistant/models/types.ts",
];

// Front files mirrored into the marketing snapshots above. We watch the pricing
// data and the model-config/provider source files, but skip front-only files
// under `front/types/assistant/models/` that the snapshot doesn't reflect.
function isWatchedMarketingSourceFile(path: string) {
  if (path === "front/lib/api/assistant/token_pricing.ts") {
    return true;
  }
  if (
    !path.startsWith("front/types/assistant/models/") ||
    !path.endsWith(".ts") ||
    path.endsWith(".test.ts")
  ) {
    return false;
  }
  const frontOnlyFiles = [
    "custom_models.generated.ts",
    "embedding.ts",
    "reasoning.ts",
    "utils.ts",
  ];
  return !frontOnlyFiles.some((f) => path.endsWith(`/${f}`));
}

function failMarketingSnapshotAck(frontFiles: string[]) {
  fail(
    "Model/pricing source files in `front` changed but the hand-maintained " +
      "`marketing` snapshots were not updated:\n" +
      frontFiles.map((f) => `- ${f}`).join("\n") +
      "\n\nThe `/home/api-pricing` page is served by `marketing`, which keeps " +
      "its own copies of the model configs and token pricing. Re-sync:\n" +
      MARKETING_SNAPSHOT_FILES.map((f) => `- \`${f}\``).join("\n") +
      "\n\nso the pricing table stays correct, or add the " +
      `\`${marketingSnapshotAckLabel}\` label if this change does not affect ` +
      "the marketing snapshots (e.g. it only touches fields the snapshot " +
      "ignores, such as `contextSize` or descriptions)."
  );
}

function warnMarketingSnapshotAck() {
  warn(
    "Model/pricing source files in `front` changed and the " +
      `\`${marketingSnapshotAckLabel}\` label is set. Confirm the marketing ` +
      "snapshots under `marketing/lib/api/assistant/token_pricing.ts` and " +
      "`marketing/types/assistant/models/` genuinely don't need updating."
  );
}

function warnMarketingSnapshotUpdated() {
  warn(
    "Both `front` model/pricing sources and the `marketing` snapshots changed. " +
      "Double-check the marketing copies match front (model ids, display names, " +
      "providers, prices) — they are mirrored by hand."
  );
}

function checkMarketingSnapshotSync(
  changedFrontFiles: string[],
  changedMarketingFiles: string[]
) {
  if (changedMarketingFiles.length > 0) {
    warnMarketingSnapshotUpdated();
  } else if (hasLabel(marketingSnapshotAckLabel)) {
    warnMarketingSnapshotAck();
  } else {
    failMarketingSnapshotAck(changedFrontFiles);
  }
}

async function checkDiffFiles() {
  const diffFiles = danger.git.modified_files
    .concat(danger.git.created_files)
    .concat(danger.git.deleted_files);

  // Model files
  const modifiedModelFiles = diffFiles.filter((path) => {
    return (
      path.startsWith("front/lib/models/") ||
      path.startsWith("front/lib/resources/storage/models/") ||
      path.startsWith("connectors/src/lib/models/") ||
      path.startsWith("connectors/src/resources/storage/models/")
    );
  });

  if (modifiedModelFiles.length > 0) {
    checkMigrationLabel();
    checkDeployPlanSection();
    await checkWorkspaceAwareModels(modifiedModelFiles);
  }

  // Documented API files (front-api owns OpenAPI generation).
  const modifiedDocumentedApiFiles = diffFiles.filter((path) => {
    return path.startsWith("front-api/routes/");
  });

  if (modifiedDocumentedApiFiles.length > 0) {
    checkDocumentationLabel();
  }

  // SDK files
  const modifiedSdksFiles = diffFiles.filter((path) => {
    return path.startsWith("sdks/js/");
  });

  if (modifiedSdksFiles.length > 0) {
    checkSDKLabel();
  }

  // dust-apps registry
  const modifiedAppsRegistry = diffFiles.filter((path) => {
    return path === "front/lib/registry.ts";
  });

  if (modifiedAppsRegistry.length > 0) {
    checkAppsRegistry();
  }

  const modifiedFrontFiles = diffFiles.filter((path) => {
    return path.startsWith("front/lib/");
  });
  if (modifiedFrontFiles.length > 0) {
    await checkRawSqlRegistry(modifiedFrontFiles);
  }

  // Model/pricing sources mirrored into the marketing snapshots that back the
  // `/home/api-pricing` page.
  const modifiedMarketingSourceFiles = diffFiles.filter(
    isWatchedMarketingSourceFile
  );
  if (modifiedMarketingSourceFiles.length > 0) {
    const modifiedMarketingSnapshotFiles = diffFiles.filter((path) =>
      MARKETING_SNAPSHOT_FILES.includes(path)
    );
    checkMarketingSnapshotSync(
      modifiedMarketingSourceFiles,
      modifiedMarketingSnapshotFiles
    );
  }

  // Sparkle version consistency check
  const modifiedPackageJsonFiles = diffFiles.filter((path) => {
    return path === "front/package.json" || path === "extension/package.json";
  });

  if (modifiedPackageJsonFiles.length > 0) {
    await checkSparkleVersionConsistency();
  }

  // Triggers workflow files
  const modifiedWorkflowFiles = diffFiles.filter((path) => {
    return path.startsWith("front/temporal/agent_schedules/");
  });
  if (modifiedWorkflowFiles.length > 0) {
    warnTriggersWorkflowChanges();
  }

  // Sandbox image registry/build changes — bumping a registered image's
  // version requires an operator kill request after deploy so existing
  // conversations cycle onto the new image.
  const modifiedSandboxImageFiles = diffFiles.filter((path) => {
    return path.startsWith("front/lib/api/sandbox/image/");
  });
  if (modifiedSandboxImageFiles.length > 0) {
    checkSandboxImageLabel();
  }

  // SSE endpoint files — changes here require a front-sse deploy too. These
  // handlers live under `front-api/routes/sse/` and are served by front-sse
  // pods via the `/api/sse/` prefix.
  const modifiedSseFiles = diffFiles.filter((path) =>
    path.startsWith("front-api/routes/sse/")
  );
  if (modifiedSseFiles.length > 0) {
    checkSSEEndpointLabel();
  }

  // Shared code used by front-sse — changes here require a front-sse deploy too.
  const sseSharedFiles = ["front/lib/auth.ts"];
  const modifiedSseSharedFiles = diffFiles.filter((path) =>
    sseSharedFiles.includes(path)
  );
  if (modifiedSseSharedFiles.length > 0) {
    checkSSESharedFilesLabel();
  }

  const sseSharedModels = [
    "front/lib/models/agent/conversation_branch.ts",
    "front/lib/models/agent/conversation_fork.ts",
    "front/lib/models/agent/conversation.ts",
    "front/lib/models/feature_flag.ts",
    "front/lib/models/plan.ts",
    "front/lib/models/provider_credential.ts",
    "front/lib/resources/storage/models/group_memberships.ts",
    "front/lib/resources/storage/models/group_spaces.ts",
    "front/lib/resources/storage/models/groups.ts",
    "front/lib/resources/storage/models/keys.ts",
    "front/lib/resources/storage/models/kill_switches.ts",
    "front/lib/resources/storage/models/membership.ts",
    "front/lib/resources/storage/models/spaces.ts",
    "front/lib/resources/storage/models/user.ts",
    "front/lib/resources/storage/models/workspace.ts",
  ];
  const modifiedSseSharedModels = diffFiles.filter((path) =>
    sseSharedModels.includes(path)
  );
  if (modifiedSseSharedModels.length > 0) {
    checkSSESharedModelsLabel();
  }

  // Audit log schema changes must ship with a bumped version in
  // schema_versions.json (deletions don't need a bump, so use add/modify only).
  const changedSchemaFiles = danger.git.modified_files
    .concat(danger.git.created_files)
    .filter(
      (path) => path.startsWith(AUDIT_SCHEMAS_PREFIX) && path.endsWith(".json")
    );
  if (changedSchemaFiles.length > 0) {
    const changedActions = changedSchemaFiles.map((path) =>
      path.slice(AUDIT_SCHEMAS_PREFIX.length).replace(/\.json$/, "")
    );
    await checkAuditSchemaVersions(changedActions);
  }
}

void checkDiffFiles();
