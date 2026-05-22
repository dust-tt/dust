import { getConversationsDataRetention } from "@app/lib/data_retention";
import {
  fetchUsageData,
  USAGE_TABLES,
  type UsageTableType,
} from "@app/lib/workspace_usage";
import { getWorkspaceUsageRetentionErrorMessage } from "@app/lib/workspace_usage_retention";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { endOfMonth } from "date-fns/endOfMonth";
import JSZip from "jszip";
import { z } from "zod";

const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "YYYY-MM" });

function getSupportedUsageTablesSchema(): z.ZodType<UsageTableType> {
  const [first, second, ...rest] = USAGE_TABLES;
  return z.union([
    z.literal(first),
    z.literal(second),
    ...rest.map((value) => z.literal(value)),
  ]);
}

const GetUsageQueryParamsSchema = z.discriminatedUnion("mode", [
  z.object({
    start: z.undefined(),
    end: z.undefined(),
    mode: z.literal("all"),
    table: getSupportedUsageTablesSchema(),
    includeInactive: z.string().optional(),
  }),
  z.object({
    start: MonthSchema,
    end: z.undefined(),
    mode: z.literal("month"),
    table: getSupportedUsageTablesSchema(),
    includeInactive: z.string().optional(),
  }),
  z.object({
    start: MonthSchema,
    end: MonthSchema,
    mode: z.literal("range"),
    table: getSupportedUsageTablesSchema(),
    includeInactive: z.string().optional(),
  }),
]);

// Mounted at /api/w/:wId/workspace-usage.
const app = workspaceApp();

app.get("/", validate("query", GetUsageQueryParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can retrieve its monthly usage.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const query = ctx.req.valid("query");
  const { endDate, startDate } = resolveDates(query);

  const conversationsRetentionDays = await getConversationsDataRetention(auth);
  const retentionErrorMessage = getWorkspaceUsageRetentionErrorMessage({
    startDate,
    retentionDays: conversationsRetentionDays,
  });
  if (retentionErrorMessage) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: retentionErrorMessage,
      },
    });
  }

  const includeInactive = query.includeInactive === "true";

  const csvData = await fetchUsageData({
    table: query.table,
    start: startDate,
    end: endDate,
    workspace: owner,
    includeInactive,
  });
  if (query.table === "all") {
    const zip = new JSZip();
    const csvSuffix = startDate
      .toLocaleString("default", { month: "short" })
      .toLowerCase();
    for (const [fileName, data] of Object.entries(csvData)) {
      if (data) {
        zip.file(
          `${fileName}_${startDate.getFullYear()}_${csvSuffix}.csv`,
          data
        );
      }
    }

    const zipContent = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(new Uint8Array(zipContent), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="usage.zip"`,
      },
    });
  }

  return new Response(csvData[query.table] ?? "", {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${query.table}.csv"`,
    },
  });
});

export default app;

function resolveDates(query: z.infer<typeof GetUsageQueryParamsSchema>) {
  switch (query.mode) {
    case "all":
      return {
        startDate: new Date("2020-01-01"),
        endDate: endOfMonth(new Date()),
      };
    case "month":
      const date = new Date(`${query.start}-01`);
      return { startDate: date, endDate: endOfMonth(date) };
    case "range":
      return {
        startDate: new Date(`${query.start}-01`),
        endDate: endOfMonth(new Date(`${query.end}-01`)),
      };
    default:
      assertNever(query);
  }
}
