import type { AuthedUser } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getWorkspaceByModelId,
  renderLightWorkspaceType,
} from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Issue } from "@app/temporal/labs/connections/providers/jira/types";
import {
  formatCommentContent,
  formatDate,
  getDefaultJiraQuery,
} from "@app/temporal/labs/connections/providers/jira/utils";
import {
  markSyncCompleted,
  markSyncFailed,
  markSyncStarted,
} from "@app/temporal/labs/connections/utils";
import type { ModelId, Result } from "@app/types";
import { CoreAPI, dustManagedCredentials, Err, Ok } from "@app/types";

import type { JiraCredentials } from "./client";
import { JiraClient } from "./client";

interface Section {
  prefix: string;
  content: string;
  sections: Section[];
}

function createIssueSection(issue: Issue, documentId: string): Section {
  const fields = issue.fields;
  const issueUrl = `https://${issue.self.split("/")[2]}/browse/${issue.key}`;

  const issueDetails = [
    `Issue Key: ${issue.key}`,
    `ID: ${issue.id}`,
    `URL: ${issueUrl}`,
    `Summary: ${fields.summary}`,
    fields.description &&
      `Description:\n${formatCommentContent(fields.description.content)}`,
    `Issue Type: ${fields.issuetype.name}`,
    `Status: ${fields.status.name}`,
    `Priority: ${fields.priority.name}`,
    `Assignee: ${
      fields.assignee
        ? `${fields.assignee.displayName} (${fields.assignee.emailAddress})`
        : "Unassigned"
    }`,
    `Reporter: ${fields.reporter.displayName} (${fields.reporter.emailAddress})`,
    `Project: ${fields.project.name} (${fields.project.key})`,
    `Created: ${formatDate(fields.created)}`,
    `Updated: ${formatDate(fields.updated)}`,
    `Resolution: ${fields.resolution ? fields.resolution.name : "Unresolved"}`,
    `Resolution Date: ${fields.resolutiondate || "N/A"}`,
    `Labels: ${fields.labels.join(", ")}`,
    `Components: ${fields.components.map((c) => c.name).join(", ")}`,
    `Time Tracking:`,
    `  Original Estimate: ${fields.timeoriginalestimate || "N/A"}`,
    `  Remaining Estimate: ${fields.timeestimate || "N/A"}`,
    `  Time Spent: ${fields.timespent || "N/A"}`,
    `Votes: ${fields.votes.votes}`,
    `Watches: ${fields.watches.watchCount}`,
    `Fix Versions: ${fields.fixVersions.map((v) => v.name).join(", ")}`,
    `Affected Versions: ${fields.versions.map((v) => v.name).join(", ")}`,
    `Subtasks: ${fields.subtasks
      .map((st) => `${st.key}: ${st.fields.summary}`)
      .join(", ")}`,
    `Issue Links: ${fields.issuelinks
      .map((link) => {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        return linkedIssue
          ? `${link.type.name} ${linkedIssue.key}: ${linkedIssue.fields.summary}`
          : "";
      })
      .filter(Boolean)
      .join(", ")}`,
    `Attachments: ${fields.attachment.map((a) => a.filename).join(", ")}`,
    `\nComments:`,
    ...fields.comment.comments.map(
      (comment) => `
[${formatDate(comment.created)}] Author: ${comment.author.displayName} (${
        comment.author.emailAddress
      })
${formatCommentContent(comment.body.content)}
`
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prefix: documentId,
    content: issueDetails,
    sections: [],
  };
}

function createIssueTags(issue: Issue): string[] {
  const fields = issue.fields;

  return [
    "jira",
    `project:${fields.project.key}`,
    `type:${fields.issuetype.name}`,
    `status:${fields.status.name}`,
    `priority:${fields.priority.name}`,
    ...fields.labels.map((label) => `label:${label}`),
    ...fields.components.map((component) => `component:${component.name}`),
  ];
}

async function upsertToDustDatasource(
  coreAPI: CoreAPI,
  userId: ModelId,
  workspaceId: ModelId,
  dataSourceViewId: ModelId,
  issue: Issue
): Promise<void> {
  const documentId = `issue-${issue.key}`;
  const section = createIssueSection(issue, documentId);
  const tags = createIssueTags(issue);

  await coreAPI.upsertDataSourceDocument({
    projectId: workspaceId.toString(),
    dataSourceId: dataSourceViewId.toString(),
    documentId,
    section,
    tags,
    parentId: null,
    parents: [],
    timestamp: new Date().toISOString(),
    upsertContext: {},
  });
}

export async function syncJiraConnection(
  configuration: LabsConnectionsConfigurationResource,
  cursor?: string
): Promise<Result<void, Error>> {
  const auth = await configuration.getUser();
  if (!auth) {
    return new Err(new Error("User not found"));
  }

  const creds = configuration.credentialId as unknown as JiraCredentials;
  if (!creds) {
    return new Err(new Error("No credentials found"));
  }

  return syncJiraIssues({
    auth,
    creds,
    dataSourceViewId: configuration.dataSourceViewId,
    cursor,
  });
}

async function syncJiraIssues({
  auth,
  creds,
  dataSourceViewId,
  cursor,
}: {
  auth: AuthedUser;
  creds: JiraCredentials;
  dataSourceViewId: ModelId;
  cursor?: string;
}): Promise<Result<void, Error>> {
  if (!creds.subdomain || !creds.email || !creds.apiToken) {
    return new Err(new Error("Invalid Jira credentials configuration"));
  }

  const jiraClient = new JiraClient({
    subdomain: creds.subdomain,
    email: creds.email,
    apiToken: creds.apiToken,
  });

  const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
    new Authenticator(auth),
    [dataSourceViewId]
  );
  if (!dataSourceViews || !dataSourceViews[0]) {
    return new Err(new Error("Data source view not found"));
  }
  const dataSourceView = dataSourceViews[0];

  const users = await UserResource.fetchByModelIds([auth.userId]);
  if (!users || !users[0]) {
    return new Err(new Error("User not found"));
  }
  const user = users[0];

  const coreAPI = new CoreAPI(auth, logger);

  try {
    await markSyncStarted(dataSourceView);

    const jql = cursor
      ? `updated >= "${cursor}" ORDER BY updated DESC`
      : getDefaultJiraQuery();

    const issuesResult = await jiraClient.getAllIssues(jql);
    if (issuesResult.isErr()) {
      return issuesResult;
    }

    const issues = issuesResult.value;
    logger.info(
      {
        workspaceId: dataSourceView.workspaceId,
        dataSourceViewId: dataSourceView.sId,
        issueCount: issues.length,
      },
      "Upserting Jira issues"
    );

    await concurrentExecutor(
      issues,
      async (issue) => {
        try {
          await upsertToDustDatasource(
            coreAPI,
            user.id,
            dataSourceView.workspaceId,
            dataSourceView.id,
            issue
          );
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              issueKey: issue.key,
              workspaceId: dataSourceView.workspaceId,
              dataSourceViewId: dataSourceView.sId,
            },
            "Failed to upsert Jira issue"
          );
        }
      },
      { concurrency: 10 }
    );

    await markSyncCompleted(dataSourceView);
    return new Ok(undefined);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markSyncFailed(dataSourceView, errorMessage);
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
