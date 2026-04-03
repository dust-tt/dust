/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  downloadAndUploadToolFile,
  getToolAccessToken,
} from "@app/lib/search/tools/search";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileType } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";

interface ToolUploadResponseBody {
  file: FileType;
}

import { z } from "zod";

const ToolUploadRequestBodySchema = z.object({
  serverViewId: z.string().min(1, "serverViewId is required"),
  externalId: z.string().min(1, "externalId is required"),
  conversationId: z.string().optional(), // TODO(seb): remove after the next extension release + a few days.
  useCase: z.enum(["conversation", "project_context"]).default("conversation"),
  useCaseMetadata: z.object({
    conversationId: z.string().optional(),
    spaceId: z.string().optional(),
  }),
  serverName: z.string().optional(),
  serverIcon: z.string().optional(),
});

export type ToolUploadRequestBody = z.infer<typeof ToolUploadRequestBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ToolUploadResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const r = ToolUploadRequestBodySchema.safeParse(req.body);
  if (!r.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: r.error.message,
      },
    });
  }
  const {
    serverViewId,
    externalId,
    useCase,
    useCaseMetadata,
    conversationId,
    serverName,
    serverIcon,
  } = r.data;

  const tokenResult = await getToolAccessToken({ auth, serverViewId });
  if (tokenResult.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: tokenResult.error.message,
      },
    });
  }

  const { tool, accessToken, metadata } = tokenResult.value;
  const result = await downloadAndUploadToolFile({
    auth,
    tool,
    accessToken,
    externalId,
    useCase,
    useCaseMetadata: {
      ...(useCaseMetadata ? useCaseMetadata : {}),
      conversationId,
    },
    metadata,
    serverName,
    serverIcon,
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  return res.status(200).json({
    file: result.value,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
