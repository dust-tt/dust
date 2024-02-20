import { assertNever } from "@dust-tt/types";
import { endOfMonth } from "date-fns";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { unsafeGetUsageData } from "@app/lib/workspace_usage";
import { apiError, withLogging } from "@app/logger/withlogging";

const MonthSchema = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s),
  "YYYY-MM"
);

const GetUsageQueryParamsSchema = t.union([
  t.type({
    start: t.undefined,
    end: t.undefined,
    mode: t.literal("all"),
  }),
  t.type({
    start: MonthSchema,
    end: t.undefined,
    mode: t.literal("month"),
  }),
  t.type({
    start: MonthSchema,
    end: MonthSchema,
    mode: t.literal("range"),
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

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

      const { endDate, startDate } = (() => {
        switch (query.mode) {
          case "all":
            return {
              startDate: new Date("2020-01-01"),
              endDate: new Date(),
            };
          case "month":
            const date = new Date(`${query.start}-01`);
            return {
              startDate: date,
              endDate: endOfMonth(date),
            };
          case "range":
            return {
              startDate: new Date(`${query.start}-01`),
              endDate: endOfMonth(new Date(`${query.end}-01`)),
            };
          default:
            assertNever(query);
        }
      })();

      const csvData = await unsafeGetUsageData(startDate, endDate, owner.sId);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="usage.csv"`);
      res.status(200).send(csvData);
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

export default withLogging(handler);
