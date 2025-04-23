import Bottleneck from "bottleneck";
import moment from "moment-timezone";
import sanitizeHtml from "sanitize-html";

// Rate limiter for Jira API
// Jira Cloud has a limit of 1000 requests per minute per user
export const jiraLimiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: 100, // 10 requests per second to stay well under the limit
});

export function formatDate(dateString: string): string {
  return moment(dateString).utc().format("YYYY-MM-DD");
}

export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

export function formatCommentContent(
  content: Array<{
    content: Array<{
      text: string;
    }>;
  }>
): string {
  return content
    .map((c) => c.content?.map((cc) => cc.text).join(""))
    .join("\n");
}

export function getDefaultJiraQuery(): string {
  return "updated >= -24h ORDER BY updated DESC";
}

export function getRequiredFields(): string[] {
  return [
    "summary",
    "description",
    "issuetype",
    "status",
    "priority",
    "assignee",
    "reporter",
    "project",
    "created",
    "updated",
    "resolutiondate",
    "resolution",
    "labels",
    "components",
    "timeoriginalestimate",
    "timeestimate",
    "timespent",
    "votes",
    "watches",
    "fixVersions",
    "versions",
    "subtasks",
    "issuelinks",
    "attachment",
    "comment",
  ];
}
