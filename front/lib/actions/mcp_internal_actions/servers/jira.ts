import { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import { normalizeError } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
    name: "jira",
    version: "1.0.0",
    description: "Jira tools to manage issues and pull requests.",
    icon: "GithubLogo",
    authorization: {
        provider: "confluence",
        use_case: "platform_actions",
    },
};

// Interface for the Jira API client
interface JiraClient {
    apiUrl: string;
    cloudId: string;
    accessToken: string;
}

// Create a Jira client with the authentication token
const createJiraClient = async (
    auth: Authenticator,
    mcpServerId: string
): Promise<JiraClient | null> => {
    const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "confluence",
    });

    if (!accessToken) {
        return null;
    }

    // Get the cloud ID from the Atlassian API
    try {
        const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Jira cloud ID: ${response.statusText}`);
        }

        const resources = await response.json();
        const cloudId = resources[0]?.id;

        if (!cloudId) {
            throw new Error("No Jira cloud instance found");
        }

        return {
            apiUrl: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`,
            cloudId,
            accessToken,
        };
    } catch (error) {
        console.error("Error creating Jira client:", error);
        return null;
    }
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
    const server = new McpServer(serverInfo);

    server.tool(
        "create_project",
        "Create a new project in Jira",
        {
            key: z.string().describe("The project key (must be uppercase, e.g., 'TEST')"),
            name: z.string().describe("The name of the project"),
            description: z.string().optional().describe("Optional description of the project"),
            leadAccountId: z.string().optional().describe("Optional account ID of the project lead"),
            projectTypeKey: z.enum(["software", "service_desk", "business"]).optional().describe("Project type (software, service_desk, or business)"),
            projectTemplateKey: z.string().optional().describe("Template to use for the project (e.g., 'com.pyxis.greenhopper.jira:gh-scrum-template')"),
        },
        async ({ key, name, description, leadAccountId, projectTypeKey, projectTemplateKey }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Project creation requires different endpoint (non-versioned API)
                const projectApiUrl = `https://api.atlassian.com/ex/jira/${jiraClient.cloudId}/rest/api/3/project`;

                const projectData: any = {
                    key,
                    name,
                    projectTypeKey: projectTypeKey || "software",
                };

                if (description) {
                    projectData.description = description;
                }

                if (leadAccountId) {
                    projectData.leadAccountId = leadAccountId;
                }

                if (projectTemplateKey) {
                    projectData.projectTemplateKey = projectTemplateKey;
                }

                const response = await fetch(projectApiUrl, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(projectData),
                });

                const data = await response.json();

                if (!response.ok) {
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error creating Jira project: ${JSON.stringify(data)}`,
                            },
                        ],
                    };
                }

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: `Project created: ${data.key} (ID: ${data.id})`,
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error creating Jira project: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "list_projects",
        "Get a list of all projects in the Jira instance",
        {
            maxResults: z.number().optional().describe("Maximum number of results to return (default: 50)"),
        },
        async ({ maxResults = 50 }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Get list of projects using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/project?maxResults=${maxResults}`, {
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error retrieving Jira projects: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                const projects = await response.json();

                // Format the projects for better readability
                const formattedProjects = projects.map((p: any) => ({
                    id: p.id,
                    key: p.key,
                    name: p.name,
                    projectTypeKey: p.projectTypeKey,
                    simplified: p.simplified,
                    style: p.style,
                    isPrivate: p.isPrivate,
                }));

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(formattedProjects, null, 2),
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving Jira projects: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "create_issue",
        "Create a new issue in a Jira project",
        {
            projectKey: z.string().describe("The project key where the issue will be created"),
            issueType: z.string().describe("The type of the issue (e.g., 'Bug', 'Task', 'Story')"),
            summary: z.string().describe("The summary/title of the issue"),
            description: z.string().describe("The description of the issue (Jira markup)"),
            priority: z.string().optional().describe("Optional priority of the issue"),
            labels: z.array(z.string()).optional().describe("Optional labels to attach to the issue"),
        },
        async ({ projectKey, issueType, summary, description, priority, labels }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Create the issue using Jira API
                const fieldsObject: any = {
                    summary,
                    project: {
                        key: projectKey,
                    },
                    issuetype: {
                        name: issueType,
                    },
                    description: {
                        type: "doc",
                        version: 1,
                        content: [
                            {
                                type: "paragraph",
                                content: [
                                    {
                                        type: "text",
                                        text: description,
                                    },
                                ],
                            },
                        ],
                    },
                };

                if (priority) {
                    fieldsObject.priority = {
                        name: priority,
                    };
                }

                if (labels && labels.length > 0) {
                    fieldsObject.labels = labels;
                }

                const response = await fetch(`${jiraClient.apiUrl}/issue`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        fields: fieldsObject,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error creating Jira issue: ${JSON.stringify(data)}`,
                            },
                        ],
                    };
                }

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: `Issue created: ${data.key}`,
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error creating Jira issue: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "get_issue",
        "Retrieve details of a Jira issue",
        {
            issueKey: z.string().describe("The key of the issue to retrieve (e.g., PROJECT-123)"),
        },
        async ({ issueKey }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Get the issue using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/issue/${issueKey}`, {
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error retrieving Jira issue: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                const issue = await response.json();

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(issue, null, 2),
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving Jira issue: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "search_issues",
        "Search for Jira issues using JQL",
        {
            jql: z.string().describe("JQL query to search for issues"),
            maxResults: z.number().optional().describe("Maximum number of results to return (default: 20)"),
        },
        async ({ jql, maxResults = 20 }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Search for issues using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/search`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        jql,
                        maxResults,
                        fields: ["summary", "status", "assignee", "priority", "created", "updated"],
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error searching Jira issues: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                const searchResults = await response.json();

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(searchResults, null, 2),
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error searching Jira issues: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "add_comment",
        "Add a comment to a Jira issue",
        {
            issueKey: z.string().describe("The key of the issue to comment on (e.g., PROJECT-123)"),
            comment: z.string().describe("The comment text to add"),
        },
        async ({ issueKey, comment }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Add a comment using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/issue/${issueKey}/comment`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        body: {
                            type: "doc",
                            version: 1,
                            content: [
                                {
                                    type: "paragraph",
                                    content: [
                                        {
                                            type: "text",
                                            text: comment,
                                        },
                                    ],
                                },
                            ],
                        },
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error adding comment to Jira issue: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                const commentResult = await response.json();

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: `Comment added successfully to ${issueKey}`,
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error adding comment to Jira issue: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "transition_issue",
        "Move a Jira issue to a different status",
        {
            issueKey: z.string().describe("The key of the issue to transition (e.g., PROJECT-123)"),
            transitionId: z.string().describe("The ID of the transition to perform"),
        },
        async ({ issueKey, transitionId }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Transition the issue using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/issue/${issueKey}/transitions`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        transition: {
                            id: transitionId,
                        },
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error transitioning Jira issue: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: `Issue ${issueKey} transitioned successfully`,
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error transitioning Jira issue: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "get_available_transitions",
        "Get the available transitions for a Jira issue",
        {
            issueKey: z.string().describe("The key of the issue (e.g., PROJECT-123)"),
        },
        async ({ issueKey }) => {
            const jiraClient = await createJiraClient(auth, mcpServerId);

            if (!jiraClient) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Failed to initialize Jira client. Please check your authentication.",
                        },
                    ],
                };
            }

            try {
                // Get available transitions using Jira API
                const response = await fetch(`${jiraClient.apiUrl}/issue/${issueKey}/transitions`, {
                    headers: {
                        Authorization: `Bearer ${jiraClient.accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error getting transitions for Jira issue: ${JSON.stringify(errorData)}`,
                            },
                        ],
                    };
                }

                const transitionsData = await response.json();

                // Format the transitions for better readability
                const formattedTransitions = transitionsData.transitions.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                }));

                return {
                    isError: false,
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(formattedTransitions, null, 2),
                        },
                    ],
                };
            } catch (e) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error getting transitions for Jira issue: ${normalizeError(e).message}`,
                        },
                    ],
                };
            }
        }
    );

    return server;
};

export default createServer;
