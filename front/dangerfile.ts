import { danger, fail, warn } from "danger";
import fs from "fs";

const sdkAckLabel = "sdk-ack";
const migrationAckLabel = "migration-ack";
const documentationAckLabel = "documentation-ack";
const auth0UpdateLabelAck = "auth0-update-ack";
const rawSqlAckLabel = "raw-sql-ack";
const sparkleVersionAckLabel = "sparkle-version-ack";

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
      `that a migration will be needed once merged into 'main'.`
  );
}

function warnMigrationAck(migrationAckLabel: string) {
  warn(
    "Files in `**/lib/models/` have been modified and the PR has the `" +
      migrationAckLabel +
      "` label. Don't forget to run the migration from prodbox."
  );
}

function checkMigrationLabel() {
  if (!hasLabel(migrationAckLabel)) {
    failMigrationAck();
  } else {
    warnMigrationAck(migrationAckLabel);
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
      "Please include a detailed Deploy Plan section in your PR description."
    );
  }
}

function checkAuth0UpdateLabel() {
  if (!hasLabel(auth0UpdateLabelAck)) {
    failAuth0UpdateLabel();
  } else {
    warnAuth0UpdateLabel(auth0UpdateLabelAck);
  }
}

function failAuth0UpdateLabel() {
  fail(
    "`**/lib/utils/blacklisted_email_domains.ts` has been modified. " +
      `Please add the \`${auth0UpdateLabelAck}\` label to acknowledge that the Auth0 blacklist has been updated.`
  );
}

function warnAuth0UpdateLabel(auth0UpdateLabelAck: string) {
  warn(
    "`**/lib/utils/blacklisted_email_domains.ts` has been modified and the PR has the `" +
      auth0UpdateLabelAck +
      "` label. Don't forget to update the Auth0 blacklist."
  );
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
    "Files in `**/api/v1/` have been modified. " +
      `Please add the \`${documentationAckLabel}\` label to acknowlegde that if anything changes 
      in a public endpoint, you need to edit the JSDoc comment 
      above the handler definition and/or the swagger_schemas.ts file and regenerate the documentation using \`npm run docs\``
  );
}

function warnDocumentationAck(documentationAckLabel: string) {
  warn(
    "Files in `**/api/v1/` have been modified and the PR has the `" +
      documentationAckLabel +
      "` label. \n" +
      "Don't forget to run `npm run docs` and use the `Deploy OpenAPI Docs` Github action to update https://docs.dust.tt/reference."
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
 * Triggers related checks based on modified files
 */
async function warnTriggersWorkflowChanges() {
  warn(
    `Files in \`front/temporal/agent_schedules/\` have been modified.
    Be careful modifying workflows/activities signatures.
    This may break running schedules. If so, soft reset them from prodbox.`
  );
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
  }

  // Public API files
  const modifiedPublicApiFiles = diffFiles.filter((path) => {
    return path.startsWith("front/pages/api/v1/");
  });

  if (modifiedPublicApiFiles.length > 0) {
    checkDocumentationLabel();
  }

  // Auth0 files
  const modifiedAuth0Files = diffFiles.filter((path) => {
    return path.startsWith("front/lib/utils/blacklisted_email_domains.ts");
  });

  if (modifiedAuth0Files.length > 0) {
    checkAuth0UpdateLabel();
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
    await warnTriggersWorkflowChanges();
  }
}

void checkDiffFiles();
