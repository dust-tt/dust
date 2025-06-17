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
        `Failed to fetch ticket ${ticketKey}: ${response.status} ${response.statusText}`
      );
      throw normalizeError(error);
    }

    const ticket = await response.json();
    return ticket as JiraTicket;
  } catch (error) {
    console.error(`Error fetching JIRA ticket ${ticketKey}:`, error);
    throw normalizeError(error);
  }
};