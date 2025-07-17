import { z } from "zod";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

// Jira entity schemas
const JiraIssueSchema = z
  .object({
    id: z.string(),
    key: z.string(),
  })
  .passthrough();

type JiraIssue = z.infer<typeof JiraIssueSchema>;
type JiraErrorResult = { error: string };
type GetIssueResult = JiraIssue | null | JiraErrorResult;

// Generic wrapper for JIRA API calls with validation
async function jiraApiCall<T>(
  endpoint: string,
  accessToken: string,
  schema: z.ZodSchema<T>,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    baseUrl: string;
  }
): Promise<T | null | { error: string }> {
  try {
    const response = await fetch(`${options.baseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(options.body && { body: JSON.stringify(options.body) }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const msg = `JIRA API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(msg);
      return { error: msg };
    }

    const responseText = await response.text();
    if (!responseText) {
      const parseResult = schema.safeParse(undefined);
      if (parseResult.success) {
        return parseResult.data;
      }
      return null;
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid JIRA response format: ${parseResult.error.message}`;
      logger.error(msg, { rawData });
      return { error: msg };
    }

    return parseResult.data;
  } catch (error: unknown) {
    logger.error(`JIRA API call failed for ${endpoint}:`, error);
    return { error: normalizeError(error).message };
  }
}

export const getIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string
): Promise<GetIssueResult> => {
  const result = await jiraApiCall(
    `/rest/api/3/issue/${issueKey}`,
    accessToken,
    JiraIssueSchema,
    { baseUrl }
  );
  if (
    result &&
    "error" in result &&
    typeof result.error === "string" &&
    result.error.includes("404")
  ) {
    return null;
  }

  return result;
};
