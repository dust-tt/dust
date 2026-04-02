/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getConversationsDataRetention } from "@app/lib/data_retention";
import {
  fetchUsageData,
  USAGE_TABLES,
  type UsageTableType,
} from "@app/lib/workspace_usage";
import { getWorkspaceUsageRetentionErrorMessage } from "@app/lib/workspace_usage_retention";
import { apiError } from "@app/logger/withlogging";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { endOfMonth } from "date-fns/endOfMonth";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import JSZip from "jszip";
import type { NextApiRequest, NextApiResponse } from "next";

const MonthSchema = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s),
  "YYYY-MM"
);

function getSupportedUsageTablesCodec(): t.Type<UsageTableType> {
  const [first, second, ...rest] = USAGE_TABLES;
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
}

const GetUsageQueryParamsSchema = t.union([
  t.type({
    start: t.undefined,
    end: t.undefined,
    mode: t.literal("all"),
    table: getSupportedUsageTablesCodec(),
  }),
  t.type({
    start: MonthSchema,
    end: t.undefined,
    mode: t.literal("month"),
    table: getSupportedUsageTablesCodec(),
  }),
  t.type({
    start: MonthSchema,
    end: MonthSchema,
    mode: t.literal("range"),
    table: getSupportedUsageTablesCodec(),
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can retrieve its monthly usage.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      const queryValidation = GetUsageQueryParamsSchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request query: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const query = queryValidation.right;
      const { endDate, startDate } = resolveDates(query);
      const conversationsRetentionDays =
        await getConversationsDataRetention(auth);
      const retentionErrorMessage = getWorkspaceUsageRetentionErrorMessage({
        startDate,
        retentionDays: conversationsRetentionDays,
      });
      if (retentionErrorMessage) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: retentionErrorMessage,
          },
        });
      }
      const includeInactiveParam = req.query.includeInactive;
      const includeInactive = Array.isArray(includeInactiveParam)
        ? includeInactiveParam[0] === "true"
        : includeInactiveParam === "true";

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

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="usage.zip"`
        );
        res.status(200).send(zipContent);
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${query.table}.csv"`
        );
        res.status(200).send(csvData[query.table]);
      }
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

function resolveDates(query: t.TypeOf<typeof GetUsageQueryParamsSchema>) {
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
