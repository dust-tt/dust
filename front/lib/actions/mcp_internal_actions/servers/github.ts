import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Octokit } from "octokit";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "github",
  version: "1.0.0",
  description: "GitHub actions to manage issues and pull requests.",
  authorization: {
    provider: "github" as const,
    use_case: "platform_actions" as const,
  },
  icon: "github",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "create_issue",
    "Create a new issue on a specified GitHub repository.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      title: z.string().describe("The title of the issue."),
      body: z.string().describe("The contents of the issue (GitHub markdown)."),
    },
    async ({ owner, repo, title, body }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "github",
      });

      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: issue } = await octokit.rest.issues.create({
          owner,
          repo,
          title,
          body,
        });

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Issue created: #${issue.number}`,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error creating GitHub issue: ${e instanceof Error ? e.message : `{e}`}`,
            },
          ],
        };
      }
    }
  );

  // server.tool(
  //   "get_pull_request",
  //   "Retrieve a pull request from a specified GitHub repository including its associated description, diff, comments and reviews.",
  //   {},
  //   async () => {
  //     // const accessToken = await getAccessTokenForInternalMCPServer(auth, {
  //     //   mcpServerId,
  //     //   provider: "github",
  //     // });

  //     return {
  //       isError: true,
  //       content: [
  //         {
  //           type: "text",
  //           text: "Not implemented",
  //         },
  //       ],
  //     };
  //   }
  // );

  return server;
};

export default createServer;
