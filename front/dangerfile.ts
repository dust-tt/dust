import { danger, warn } from "danger";

const modifiedModelFiles = danger.git.modified_files.filter((path) => {
  return (
    path.startsWith("front/lib/models/") ||
    path.startsWith("connectors/src/lib/models/")
  );
});

if (modifiedModelFiles.length > 0) {
  const migrationLabel = "migration-applied";
  const hasMigrationLabel = danger.github.issue.labels.some(
    (label) => label.name === migrationLabel
  );

  if (!hasMigrationLabel) {
    fail(
      "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified. " +
        "A migration is required! Please ensure the PR has the `" +
        migrationLabel +
        "` label before merging."
    );
  } else {
    warn(
      "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified and the PR has the `" +
        migrationLabel +
        "` label. Please double-check the migration is properly applied."
    );
  }
}
