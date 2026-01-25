import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  renderAccrualBalances,
  renderCurrentEmployee,
  renderEmployees,
  renderPTORequestNotes,
  renderPTORequestResult,
  renderPTORequests,
  renderSchedules,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/rendering";
import type { UkgReadyPTORequestObject } from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/types";
import {
  createPTORequest,
  deletePTORequest,
  getAccrualBalances,
  getAllPTORequests,
  getCurrentEmployee,
  getEmployees,
  getPTORequestNotes,
  getSchedules,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/ukg_ready_api_helper";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const UKG_READY_TOOL_LOG_NAME = "ukg_ready";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ukg_ready");

  server.tool(
    "get_my_info",
    "Get your own employee information from UKG Ready, including your employee ID, name, and username.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async (_args, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getCurrentEmployee(
              accessToken,
              instanceUrl,
              companyId
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              {
                type: "text" as const,
                text: renderCurrentEmployee(result.value),
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_pto_requests",
    "Get your PTO/time-off requests. Can filter by date range and account IDs.",
    {
      fromDate: z
        .string()
        .optional()
        .describe("Filter requests starting from this date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .optional()
        .describe("Filter requests ending before this date (YYYY-MM-DD)"),
      usernames: z
        .array(z.string())
        .optional()
        .describe("List of usernames to filter by"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ fromDate, toDate, usernames }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getAllPTORequests(
              accessToken,
              instanceUrl,
              companyId,
              {
                fromDate,
                toDate,
                usernames,
              }
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              { type: "text" as const, text: renderPTORequests(result.value) },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_accrual_balances",
    "Get accrual balances for yourself or a specific employee.",
    {
      accountId: z
        .string()
        .optional()
        .describe(
          "Account ID of the employee to get balances for. If not provided, returns your own balances."
        ),
      asOfDate: z
        .string()
        .optional()
        .describe(
          "Get balance as of a specific date (YYYY-MM-DD). If not provided, returns current balance."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ accountId, asOfDate }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getAccrualBalances(
              accessToken,
              instanceUrl,
              companyId,
              {
                accountId,
                asOfDate,
              }
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              {
                type: "text" as const,
                text: renderAccrualBalances(result.value),
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_pto_request_notes",
    "Get notes/comments for a specific PTO request.",
    {
      noteThreadId: z
        .string()
        .describe(
          "The note thread ID for the PTO request (found in the note_thread_id field of a PTO request)"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ noteThreadId }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getPTORequestNotes(
              accessToken,
              instanceUrl,
              companyId,
              noteThreadId
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              {
                type: "text" as const,
                text: renderPTORequestNotes(result.value),
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "create_pto_request",
    "Create a new time off request. Use get_accrual_balances to see available time off types.",
    {
      timeOffTypeName: z
        .string()
        .describe(
          "CRITICAL: Must be the EXACT time off type name from get_accrual_balances output. First call get_accrual_balances, find the line starting with 'Time Off Type Name:', then copy the text between the quotes character-for-character (including spaces, parentheses, and capitalization). Do NOT modify. If the request fails with 'Time Off not found', validate that you copied the exact name from get_accrual_balances."
        ),
      requestType: z
        .enum(["FullDay", "Partial", "PartialBlk", "Multiple", "Dynamic"])
        .describe(
          "Field requirements vary by request type: FullDay requires from_date; Partial requires from_date, from_time, to_time; PartialBlk requires from_date, total_time; Multiple requires from_date, to_date; Dynamic requires from_date, dynamic_duration."
        ),
      fromDate: z.string().describe("Start date in YYYY-MM-DD format"),
      toDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
      fromTime: z
        .string()
        .optional()
        .describe(
          "Start time in HH:MM:SS format (24-hour, required for Partial type only)"
        ),
      toTime: z
        .string()
        .optional()
        .describe(
          "End time in HH:MM:SS format (24-hour, required for Partial type only)"
        ),
      totalTime: z
        .string()
        .optional()
        .describe(
          "Total time in decimal format (required for PartialBlk type only, e.g., '1.00' for 1 hour)"
        ),
      dynamicDuration: z
        .enum([
          "FULL_DAY",
          "FIRST_HALF_OF_DAY",
          "SECOND_HALF_OF_DAY",
          "HALF_DAY",
          "FILL_DAY",
        ])
        .optional()
        .describe(
          "Dynamic duration (required for Dynamic type only): FULL_DAY, FIRST_HALF_OF_DAY, SECOND_HALF_OF_DAY, HALF_DAY, FILL_DAY"
        ),
      comment: z
        .string()
        .optional()
        .describe("Optional comment/note for the PTO request"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async (
        {
          timeOffTypeName,
          requestType,
          fromDate,
          toDate,
          fromTime,
          toTime,
          totalTime,
          dynamicDuration,
          comment,
        },
        { authInfo }
      ) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            if (requestType === "Partial" && (!fromTime || !toTime)) {
              return new Err(
                new MCPError("Partial type requires both fromTime and toTime")
              );
            }
            if (requestType === "PartialBlk" && !totalTime) {
              return new Err(
                new MCPError("PartialBlk type requires totalTime")
              );
            }
            if (requestType === "Dynamic" && !dynamicDuration) {
              return new Err(
                new MCPError("Dynamic type requires dynamicDuration")
              );
            }
            if (requestType === "Multiple" && !toDate) {
              return new Err(new MCPError("Multiple type requires toDate"));
            }

            const currentEmployeeResult = await getCurrentEmployee(
              accessToken,
              instanceUrl,
              companyId
            );

            if (currentEmployeeResult.isErr()) {
              return new Err(new MCPError(currentEmployeeResult.error));
            }

            const currentEmployee = currentEmployeeResult.value;
            if (!currentEmployee.username) {
              return new Err(
                new MCPError("Current employee does not have a username")
              );
            }

            const ptoRequest: UkgReadyPTORequestObject = {
              employee: { username: currentEmployee.username },
              time_off: { name: timeOffTypeName },
              type: requestType,
              from_date: fromDate,
            };

            if (comment) {
              ptoRequest.comment = comment;
            }
            if (toDate) {
              ptoRequest.to_date = toDate;
            }
            if (fromTime) {
              ptoRequest.from_time = fromTime;
            }
            if (toTime) {
              ptoRequest.to_time = toTime;
            }
            if (totalTime) {
              ptoRequest.total_time = totalTime;
            }
            if (dynamicDuration) {
              ptoRequest.dynamic_duration = dynamicDuration;
            }

            const requestBody = {
              pto_request: ptoRequest,
            };

            const result = await createPTORequest(
              accessToken,
              instanceUrl,
              companyId,
              requestBody
            );

            if (result.isErr()) {
              const errorMsg = result.error;
              if (
                typeof errorMsg === "string" &&
                errorMsg.includes("Time Off not found")
              ) {
                return new Err(
                  new MCPError(
                    `Time Off type "${timeOffTypeName}" not found. Please use get_accrual_balances to see the exact list of available time off types.`
                  )
                );
              }
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              {
                type: "text" as const,
                text: renderPTORequestResult(result.value),
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "delete_pto_request",
    "Delete one or more PTO/time-off requests.",
    {
      requestIds: z
        .array(z.string())
        .describe("Array of PTO request IDs to delete"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment explaining the deletion"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ requestIds, comment }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await deletePTORequest(
              accessToken,
              instanceUrl,
              companyId,
              requestIds,
              comment
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            const message =
              requestIds.length === 1
                ? `PTO request ${requestIds[0]} deleted successfully.`
                : `${requestIds.length} PTO requests deleted successfully.`;

            return new Ok([
              {
                type: "text" as const,
                text: message,
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_schedules",
    "Get work schedules for yourself or a specific employee.",
    {
      username: z
        .string()
        .optional()
        .describe(
          "Username of the employee to get schedules for. If not provided, returns your own schedules."
        ),
      fromDate: z
        .string()
        .optional()
        .describe("Filter schedules from this date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .optional()
        .describe("Filter schedules to this date (YYYY-MM-DD)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ username, fromDate, toDate }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getSchedules(
              accessToken,
              instanceUrl,
              companyId,
              {
                username,
                fromDate,
                toDate,
              }
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              { type: "text" as const, text: renderSchedules(result.value) },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_employees",
    "Get a list of active employees.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getEmployees(
              accessToken,
              instanceUrl,
              companyId
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              { type: "text" as const, text: renderEmployees(result.value) },
            ]);
          },
        });
      }
    )
  );

  return server;
}

export default createServer;
