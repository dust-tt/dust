import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
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
} from "@app/lib/api/actions/servers/ukg_ready/helpers";
import { UKG_READY_TOOLS_METADATA } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import {
  renderAccrualBalances,
  renderCurrentEmployee,
  renderEmployees,
  renderPTORequestNotes,
  renderPTORequestResult,
  renderPTORequests,
  renderSchedules,
} from "@app/lib/api/actions/servers/ukg_ready/rendering";
import type { UkgReadyPTORequestObject } from "@app/lib/api/actions/servers/ukg_ready/types";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof UKG_READY_TOOLS_METADATA> = {
  get_my_info: async (_params, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getCurrentEmployee(ctx);

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        {
          type: "text" as const,
          text: renderCurrentEmployee(result.value),
        },
      ]);
    });
  },

  get_pto_requests: async ({ fromDate, toDate, usernames }, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getAllPTORequests(ctx, {
        fromDate,
        toDate,
        usernames,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        { type: "text" as const, text: renderPTORequests(result.value) },
      ]);
    });
  },

  get_accrual_balances: async ({ accountId, asOfDate }, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getAccrualBalances(ctx, {
        accountId,
        asOfDate,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        {
          type: "text" as const,
          text: renderAccrualBalances(result.value),
        },
      ]);
    });
  },

  get_pto_request_notes: async ({ noteThreadId }, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getPTORequestNotes(ctx, noteThreadId);

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        {
          type: "text" as const,
          text: renderPTORequestNotes(result.value),
        },
      ]);
    });
  },

  create_pto_request: async (
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
    extra
  ) => {
    return withAuth(extra, async (ctx) => {
      if (requestType === "Partial" && (!fromTime || !toTime)) {
        return new Err(
          new MCPError("Partial type requires both fromTime and toTime")
        );
      }
      if (requestType === "PartialBlk" && !totalTime) {
        return new Err(new MCPError("PartialBlk type requires totalTime"));
      }
      if (requestType === "Dynamic" && !dynamicDuration) {
        return new Err(new MCPError("Dynamic type requires dynamicDuration"));
      }
      if (requestType === "Multiple" && !toDate) {
        return new Err(new MCPError("Multiple type requires toDate"));
      }

      const currentEmployeeResult = await getCurrentEmployee(ctx);

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

      const result = await createPTORequest(ctx, requestBody);

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
    });
  },

  delete_pto_request: async ({ requestIds, comment }, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await deletePTORequest(ctx, requestIds, comment);

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
    });
  },

  get_schedules: async ({ username, fromDate, toDate }, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getSchedules(ctx, {
        username,
        fromDate,
        toDate,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        { type: "text" as const, text: renderSchedules(result.value) },
      ]);
    });
  },

  get_employees: async (_params, extra) => {
    return withAuth(extra, async (ctx) => {
      const result = await getEmployees(ctx);

      if (result.isErr()) {
        return new Err(new MCPError(result.error));
      }

      return new Ok([
        { type: "text" as const, text: renderEmployees(result.value) },
      ]);
    });
  },
};

export const TOOLS = buildTools(UKG_READY_TOOLS_METADATA, handlers);
