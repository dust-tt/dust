import { danger, fail, warn } from "danger";

const migrationAckLabel = "migration-ack";
const documentationAckLabel = "documentation-ack";

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

function checkModifiedFiles() {
  const modifiedModelFiles = danger.git.modified_files.filter((path) => {
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

  const modifiedPublicApiFiles = danger.git.modified_files.filter((path) => {
    return path.startsWith("front/pages/api/v1/");
  });

  if (modifiedPublicApiFiles.length > 0) {
    checkDocumentationLabel();
  }
}

checkModifiedFiles();
