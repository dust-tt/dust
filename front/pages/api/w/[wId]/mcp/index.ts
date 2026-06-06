/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { isRemoteMCPServerError } from "@app/lib/actions/mcp_errors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  CreateMCPServerResponseBody,
  GetMCPServersResponseBody,
} from "@app/lib/api/mcp";
import {
  createInternalMCPServer,
  createRemoteMCPServer,
  listMCPServersWithViews,
} from "@app/lib/api/mcp/servers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const CustomHeadersSchema = z
  .array(z.object({ key: z.string(), value: z.string() }))
  .optional();

const UseCaseSchema = z
  .enum(["platform_actions", "personal_actions"])
  .optional();

const PostBodySchema = z.discriminatedUnion("serverType", [
  z.object({
    serverType: z.literal("remote"),
    url: z.string(),
    defaultServerId: z.number().optional(),
    includeGlobal: z.boolean().optional(),
    sharedSecret: z.string().optional(),
    useCase: UseCaseSchema,
    connectionId: z.string().optional(),
    customHeaders: CustomHeadersSchema,
  }),
  z.object({
    serverType: z.literal("internal"),
    name: z.string(),
    useCase: UseCaseSchema,
    connectionId: z.string().optional(),
    includeGlobal: z.boolean().optional(),
    sharedSecret: z.string().optional(),
    customHeaders: CustomHeadersSchema,
    viewName: z.string().optional(),
    oauthScope: z.string().optional(),
  }),
]);

type MCPEndpointErrorResponse = {
  error: { type: string; message: string };
  isRemoteServerError?: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetMCPServersResponseBody
    | CreateMCPServerResponseBody
    | MCPEndpointErrorResponse
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const servers = await listMCPServersWithViews(auth);
      return res.status(200).json({ success: true, servers });
    }
    case "POST": {
      const r = PostBodySchema.safeParse(req.body);
      if (!r.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const result =
        r.data.serverType === "remote"
          ? await createRemoteMCPServer(auth, r.data)
          : await createInternalMCPServer(auth, r.data);

      if (result.isErr()) {
        const message = result.error.message;
        if (isRemoteMCPServerError(result.error)) {
          res.status(400).json({
            error: { type: "invalid_request_error", message },
            isRemoteServerError: true,
          });
          return;
        }
        return apiError(req, res, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message },
        });
      }

      return res.status(201).json({ success: true, server: result.value });
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
