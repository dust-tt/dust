import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTicket, searchTickets } from './standalone_api_helper.js';
import { ERROR_MESSAGES, withAuth } from './standalone_utils.js';

const serverInfo = {
  name: 'jira-standalone',
  version: '1.0.0',
  description: 'Standalone JIRA MCP server providing access to JIRA tickets using the JIRA REST API.',
  authorization: {
    provider: 'jira',
    supported_use_cases: ['platform_actions'],
  },
  icon: 'JiraLogo',
  documentationUrl: 'https://developer.atlassian.com/server/jira/platform/rest/v10007/intro/',
};

const createServer = () => {
  const server = new McpServer(serverInfo);

  // Tool: Get single ticket by key
  server.tool(
    'get_tickets',
    'Retrieves a single JIRA ticket by its key (e.g., "PROJ-123").',
    {
      ticketKey: z.string().describe('The JIRA ticket key (e.g., "PROJ-123")'),
    },
    async ({ ticketKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const ticket = await getTicket(baseUrl, accessToken, ticketKey);
          if (!ticket) {
            return makeToolTextError(ERROR_MESSAGES.TICKET_NOT_FOUND);
          }
          return makeToolJSONSuccess({
            message: 'Ticket retrieved successfully',
            result: ticket,
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  // Tool: List/search tickets with JQL
  server.tool(
    'list_tickets',
    'Lists JIRA tickets based on a JQL query. Returns a paginated list of tickets.',
    {
      jql: z
        .string()
        .optional()
        .describe('JQL query to filter tickets (e.g., "project = PROJ AND status = Open")'),
      startAt: z
        .number()
        .optional()
        .describe('Starting index for pagination (default: 0)'),
      maxResults: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default: 50)'),
    },
    async ({ jql, startAt, maxResults }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchTickets(baseUrl, accessToken, jql, startAt, maxResults);
          return makeToolJSONSuccess({
            message: 'Tickets retrieved successfully',
            result,
          });
        },
        authInfo,
        params: { jql, startAt, maxResults },
      });
    }
  );

  return server;
};

// Utility functions for tool results
function makeToolTextError(text) {
  return {
    isError: true,
    content: [{ type: 'text', text }],
  };
}

function makeToolJSONSuccess({ message, result }) {
  return {
    isError: false,
    content: [
      ...(message ? [{ type: 'text', text: message }] : []),
      { type: 'text', text: JSON.stringify(result, null, 2) },
    ],
  };
}

export default createServer;
export { serverInfo };