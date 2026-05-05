import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { apiError } from "@app/logger/withlogging";
import type { AppType } from "@app/types/app";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export const AppTypeSchema = z.object({
  sId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  savedSpecification: z.string().nullable(),
  savedConfig: z.string().nullable(),
  savedRun: z.string().nullable(),
  dustAPIProjectId: z.string(),
  datasets: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        schema: z
          .array(
            z.object({
              type: z.enum(["string", "number", "boolean", "json"]),
              description: z.string().nullable(),
              key: z.string(),
            })
          )
          .nullish(),
        data: z.array(z.record(z.string(), z.any())).nullish(),
      })
    )
    .optional(),
  coreSpecifications: z.record(z.string(), z.string()).optional(),
});

export const ImportAppBody = z.object({
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

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

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

  const bodyValidation = ImportAppBody.safeParse(body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body format",
      },
    });
  }

  const result = await importApp(auth, space, bodyValidation.data.app);

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

export default withSessionAuthenticationForPoke(handler);
