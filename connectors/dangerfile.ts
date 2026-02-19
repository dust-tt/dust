import { danger, warn } from "danger";

/**
 * Warn about renaming activities in Temporal workflows.
 *
 * Renaming activity functions can cause non-deterministic errors in Temporal
 * because running workflows may still reference the old activity names.
 * Always use activity versioning or create new activities instead of renaming.
 */
async function warnActivityRenames() {
  warn(
    `Files in \`connectors/src/**/temporal/activities.ts\` have been modified.

    **IMPORTANT**: Renaming activity functions can cause non-deterministic errors in Temporal workflows.

    Running workflows may still reference the old activity names, which will cause failures when they try to execute.

    Best practices:
    - **DO NOT** rename existing activity functions
    - **DO** create new activities with new names if you need different behavior
    - **DO** use activity versioning patterns if you must change activity signatures
    - **DO** ensure all running workflows complete before removing old activities

    If you're only adding new activities or fixing bugs within existing ones, this warning can be ignored.`
  );
}

async function checkDiffFiles() {
  const diffFiles = danger.git.modified_files
    .concat(danger.git.created_files)
    .concat(danger.git.deleted_files);

  // Activity files
  const modifiedActivityFiles = diffFiles.filter((path) => {
    return path.match(/connectors\/src\/.*\/temporal\/activities\.ts$/);
  });

  if (modifiedActivityFiles.length > 0) {
    await warnActivityRenames();
  }
}

void checkDiffFiles();
