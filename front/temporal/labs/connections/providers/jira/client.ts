import type { AxiosInstance } from "axios";
import axios from "axios";
import { isRight } from "fp-ts/lib/Either";

import type {
  Issue,
  JiraSearchResponse,
} from "@app/temporal/labs/connections/providers/jira/types";
import { JiraSearchResponseCodec } from "@app/temporal/labs/connections/providers/jira/types";
import {
  getDefaultJiraQuery,
  getRequiredFields,
  jiraLimiter,
} from "@app/temporal/labs/connections/providers/jira/utils";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export interface JiraCredentials {
  subdomain: string;
  email: string;
  apiToken: string;
}

export class JiraClient {
  private client: AxiosInstance;
  private subdomain: string;

  constructor(credentials: JiraCredentials) {
    this.subdomain = credentials.subdomain;
    this.client = axios.create({
      baseURL: `https://${credentials.subdomain}.atlassian.net/rest/api/3`,
      auth: {
        username: credentials.email,
        password: credentials.apiToken,
      },
      headers: {
        "Content-Type": "application/json",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  async searchIssues(
    jql: string = getDefaultJiraQuery(),
    startAt: number = 0,
    maxResults: number = 50
  ): Promise<Result<JiraSearchResponse, Error>> {
    try {
      const response = await jiraLimiter.schedule(() =>
        this.client.post("/search", {
          jql,
          startAt,
          maxResults,
          fields: getRequiredFields(),
          expand: ["renderedFields"],
        })
      );

      const decoded = JiraSearchResponseCodec.decode(response.data);
      if (isRight(decoded)) {
        return new Ok(decoded.right);
      } else {
        return new Err(new Error("Failed to decode Jira search response"));
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 429) {
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
            10
          );
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000)
          );
          return this.searchIssues(jql, startAt, maxResults);
        }
        return new Err(
          new Error(
            `Jira API error: ${error.response.status} - ${JSON.stringify(
              error.response.data
            )}`
          )
        );
      }
      return new Err(new Error(`Unexpected error: ${error}`));
    }
  }

  async getAllIssues(
    jql: string = getDefaultJiraQuery()
  ): Promise<Result<Issue[], Error>> {
    try {
      let allIssues: Issue[] = [];
      let startAt = 0;
      const maxResults = 50;
      let total = 0;

      do {
        const response = await this.searchIssues(jql, startAt, maxResults);
        if (response.isErr()) {
          return response;
        }

        const data = response.value;
        allIssues = allIssues.concat(data.issues);
        total = data.total;
        startAt += maxResults;
      } while (allIssues.length < total);

      return new Ok(allIssues);
    } catch (error) {
      return new Err(new Error(`Failed to fetch all issues: ${error}`));
    }
  }

  getIssueUrl(issueKey: string): string {
    return `https://${this.subdomain}.atlassian.net/browse/${issueKey}`;
  }
}
