import type { GetWorkspaceUsageResponseType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { unsafeGetUsageData } from "@app/lib/workspace_usage";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const DateString = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s),
  "YYYY-MM-DD"
);

const GetWorkspaceUsageSchema = t.intersection([
  t.type({
    start_date: DateString,
  }),
  t.partial({
    end_date: t.union([DateString, t.undefined, t.null]),
  }),
]);

/**
 * @ignoreswagger
 * Deprecated endpoint - not documentated anymore.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceUsageResponseType>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);
  if (!flags.includes("usage_data_api")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The workspace does not have access to the usage data API.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetWorkspaceUsageSchema.decode(req.query);
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

      const csvData = await unsafeGetUsageData(
        new Date(query.start_date),
        query.end_date ? new Date(query.end_date) : new Date(),
        owner
      );
      res.setHeader("Content-Type", "text/csv");
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

export default withPublicAPIAuthentication(handler);
