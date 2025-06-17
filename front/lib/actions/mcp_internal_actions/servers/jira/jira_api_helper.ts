import { normalizeError } from "@app/types";

export const MAX_LIMIT = 50;

export interface JiraTicket {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    priority?: {
      name: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
    };
    created: string;
    updated: string;
    issuetype: {
      name: string;
    };
    project: {
      key: string;
      name: string;
    };
  };
}

export interface JiraSearchResult {
  issues: JiraTicket[];
  total: number;
  startAt: number;
  maxResults: number;
}

export const getTicket = async (
  baseUrl: string,
  accessToken: string,
  ticketKey: string
): Promise<JiraTicket | null> => {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${ticketKey}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = new Error(
        `Failed to fetch ticket ${baseUrl} ${ticketKey}: ${response.status} ${response.statusText}`
      );
      throw normalizeError(error);
    }

    const ticket = await response.json();
    return ticket as JiraTicket;
  } catch (error) {
    console.error(`${baseUrl} Error fetching JIRA ticket ${ticketKey}:`, error);
    throw normalizeError(error);
  }
};

export const searchTickets = async (
  baseUrl: string,
  accessToken: string,
  jql: string = "*",
  startAt: number = 0,
  maxResults: number = MAX_LIMIT
): Promise<JiraSearchResult> => {
  try {
    const response = await fetch(
      `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = new Error(
        `Failed to search tickets: ${response.status} ${response.statusText}`
      );
      throw normalizeError(error);
    }

    const result = await response.json();
    return result as JiraSearchResult;
  } catch (error) {
    console.error("Error searching JIRA tickets:", error);
    throw normalizeError(error);
  }
};
