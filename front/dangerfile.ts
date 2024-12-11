import { danger, fail, warn } from "danger";

const migrationAckLabel = "migration-ack";
const documentationAckLabel = "documentation-ack";
const auth0UpdateLabelAck = "auth0-update-ack";

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

  const modifiedAuth0Files = danger.git.modified_files.filter((path) => {
    return path.startsWith("front/lib/utils/blacklisted_email_domains.ts");
  });

  if (modifiedAuth0Files.length > 0) {
    checkAuth0UpdateLabel();
  }
}

checkModifiedFiles();
