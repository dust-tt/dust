import { danger, warn } from "danger";

const modifiedModelFiles = danger.git.modified_files.filter((path) => {
  return (
    path.startsWith("front/lib/models/") ||
    path.startsWith("connectors/src/lib/models/")
  );
});

if (modifiedModelFiles.length > 0) {
  const migrationAckLabel = "migration-ack";
  const hasMigrationAckLabel = danger.github.issue.labels.some(
    (label) => label.name === migrationAckLabel
  );

  if (!hasMigrationAckLabel) {
    fail(
      "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified. " +
        `Please add the \`${migrationAckLabel}\` label to acknowledge that a migration will be needed once merged into 'main'.`
    );
  } else {
    warn(
      "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified and the PR has the `" +
        hasMigrationAckLabel +
        "` label. Don't forget to run the migration from the `-edge` infrastructure."
    );
  }
}
