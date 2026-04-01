/** @ignoreswagger */
import { importAgentConfigurationFromYAMLString } from "@app/lib/api/assistant/configuration/yaml_import";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { AgentConfigurationSchema } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostAgentConfigurationFromYAMLRequestBodySchema = z.object({
  yamlContent: z.string(),
});

export type PostAgentConfigurationFromYAMLRequestBody = z.infer<
  typeof PostAgentConfigurationFromYAMLRequestBodySchema
>;

export const PostAgentConfigurationFromYAMLResponseBodySchema = z.object({
  agentConfiguration: AgentConfigurationSchema,
  skippedActions: z
    .array(z.object({ name: z.string(), reason: z.string() }))
    .optional(),
});
export type PostAgentConfigurationFromYAMLResponseBody = z.infer<
  typeof PostAgentConfigurationFromYAMLResponseBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostAgentConfigurationFromYAMLResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation =
    PostAgentConfigurationFromYAMLRequestBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error.message}`,
      },
    });
  }

  const result = await importAgentConfigurationFromYAMLString(
    auth,
    bodyValidation.data.yamlContent
  );

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  const { agentConfiguration, skippedActions } = result.value;

  return res.status(200).json({
    agentConfiguration,
    skippedActions: skippedActions.length > 0 ? skippedActions : undefined,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
