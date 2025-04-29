import type { ApiAppType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { apiError } from "@app/logger/withlogging";
import type { AppType, WithAPIErrorResponse } from "@app/types";

const AppTypeSchema = t.type({
  sId: t.string,
  name: t.string,
  description: t.union([t.string, t.null]),
  savedSpecification: t.union([t.string, t.null]),
  savedConfig: t.union([t.string, t.null]),
  savedRun: t.union([t.string, t.null]),
  dustAPIProjectId: t.string,
  datasets: t.union([
    t.array(
      t.type({
        name: t.string,
        description: t.union([t.string, t.null]),
        schema: t.union([
          t.array(
            t.type({
              type: t.union([
                t.literal("string"),
                t.literal("number"),
                t.literal("boolean"),
                t.literal("json"),
              ]),
              description: t.union([t.string, t.null]),
              key: t.string,
            })
          ),
          t.null,
          t.undefined,
        ]),
        data: t.union([
          t.array(t.record(t.string, t.any)),
          t.null,
          t.undefined,
        ]),
      })
    ),
    t.undefined,
  ]),
  coreSpecifications: t.union([t.record(t.string, t.string), t.undefined]),
});

const ImportAppBody = t.type({
  app: AppTypeSchema,
});

/**
 * @ignoreswagger
 * Internal endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ app: AppType }>>,
  session: SessionWithUser
) {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const body = req.body;

  const spaceId = req.query.spaceId as string;

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Space not found.",
      },
    });
  }

  const bodyValidation = ImportAppBody.decode(body);
  if (isLeft(bodyValidation)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body format",
      },
    });
  }

  const result = await importApp(auth, space, bodyValidation.right.app);

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  res.status(200).json({ app: result.value.app.toJSON() });
}

export default withSessionAuthentication(handler);
