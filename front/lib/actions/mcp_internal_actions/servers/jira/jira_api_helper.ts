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

export interface CreateIssueRequest {
  project: {
    key: string;
  };
  summary: string;
  description?: string;
  issuetype: {
    name: string;
  };
  priority?: {
    name: string;
  };
  assignee?: {
    accountId: string;
  };
  labels?: string[];
}

export const createIssue = async (
  baseUrl: string,
  accessToken: string,
  issueData: CreateIssueRequest
): Promise<JiraTicket> => {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: issueData,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Failed to create issue: ${response.status} ${response.statusText} - ${errorBody}`
      );
      throw normalizeError(error);
    }

    const result = await response.json();
    return result as JiraTicket;
  } catch (error) {
    console.error("Error creating JIRA issue:", error);
    throw normalizeError(error);
  }
};

export const updateIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  updateData: Partial<CreateIssueRequest>
): Promise<void> => {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: updateData,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Failed to update issue ${issueKey}: ${response.status} ${response.statusText} - ${errorBody}`
      );
      throw normalizeError(error);
    }
  } catch (error) {
    console.error(`Error updating JIRA issue ${issueKey}:`, error);
    throw normalizeError(error);
  }
};

export interface JiraComment {
  id: string;
  body: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  created: string;
  updated: string;
}

export const addComment = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  commentBody: string,
  visibility?: {
    type: "group" | "role";
    value: string;
  }
): Promise<JiraComment> => {
  try {
    const requestBody: any = {
      body: commentBody,
    };

    if (visibility) {
      requestBody.visibility = visibility;
    }

    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Failed to add comment to issue ${issueKey}: ${response.status} ${response.statusText} - ${errorBody}`
      );
      throw normalizeError(error);
    }

    const result = await response.json();
    return result as JiraComment;
  } catch (error) {
    console.error(`Error adding comment to JIRA issue ${issueKey}:`, error);
    throw normalizeError(error);
  }
};

export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export const getTransitions = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string
): Promise<JiraTransitionsResponse> => {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Failed to get transitions for issue ${issueKey}: ${response.status} ${response.statusText} - ${errorBody}`
      );
      throw normalizeError(error);
    }

    const result = await response.json();
    return result as JiraTransitionsResponse;
  } catch (error) {
    console.error(`Error getting transitions for JIRA issue ${issueKey}:`, error);
    throw normalizeError(error);
  }
};

export const transitionIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  transitionId: string,
  comment?: string
): Promise<void> => {
  try {
    const requestBody: any = {
      transition: {
        id: transitionId,
      },
    };

    if (comment) {
      requestBody.update = {
        comment: [
          {
            add: {
              body: comment,
            },
          },
        ],
      };
    }

    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Failed to transition issue ${issueKey}: ${response.status} ${response.statusText} - ${errorBody}`
      );
      throw normalizeError(error);
    }
  } catch (error) {
    console.error(`Error transitioning JIRA issue ${issueKey}:`, error);
    throw normalizeError(error);
  }
};
