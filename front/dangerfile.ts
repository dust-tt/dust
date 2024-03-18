import { danger, fail, warn } from "danger";

function failMigrationAck() {
  fail(
    "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified. " +
      `Addition and deletion should be in 2 separate PRs:
      1. Addition: migrate and deploy
      2. Deletion: deploy and migrate

      Please add the \`migration-ack\` label to acknowledge that a migration will be needed once merged into 'main'.`
  );
}

function warnMigrationAck(migrationAckLabel: string) {
  warn(
    "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified and the PR has the `" +
      migrationAckLabel +
      "` label. Don't forget to run the migration from the `-edge` infrastructure."
  );
}

function checkMigrationLabel() {
  const migrationAckLabel = "migration-ack";
  const hasMigrationAckLabel = danger.github.issue.labels.some(
    (label) => label.name === migrationAckLabel
  );

  if (!hasMigrationAckLabel) {
    failMigrationAck();
  } else {
    warnMigrationAck(migrationAckLabel);
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

function checkModifiedModelFiles() {
  const modifiedModelFiles = danger.git.modified_files.filter((path) => {
    return (
      path.startsWith("front/lib/models/") ||
      path.startsWith("connectors/src/lib/models/")
    );
  });

  if (modifiedModelFiles.length > 0) {
    checkMigrationLabel();
    checkDeployPlanSection();
  }
}

checkModifiedModelFiles();
