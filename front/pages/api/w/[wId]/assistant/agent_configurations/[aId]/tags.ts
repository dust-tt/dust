import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { TagType } from "@app/types/tag";
import { isBuilder } from "@app/types/user";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

// Changed schema to accept optional add/remove lists
export const PatchAgentTagsRequestBodySchema = t.intersection([
  t.partial({
    addTagIds: t.array(t.string),
    removeTagIds: t.array(t.string),
  }),
  t.refinement(
    t.partial({
      addTagIds: t.array(t.string),
      removeTagIds: t.array(t.string),
    }),
    (body) =>
      (body.addTagIds?.length ?? 0) > 0 || (body.removeTagIds?.length ?? 0) > 0,
    "Either addTagIds or removeTagIds must be provided and contain at least one ID."
  ),
]);

export type PatchAgentTagsRequestBody = t.TypeOf<
  typeof PatchAgentTagsRequestBodySchema
>;

export interface PatchAgentTagsResponseBody {
  tags: TagType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchAgentTagsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId as string;

  const agent = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (!agent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      if (!agent.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_group_permission_error",
            message:
              "Only editors of the agent or workspace admins can modify agent.",
          },
        });
      }

      const bodyValidation = PatchAgentTagsRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { addTagIds = [], removeTagIds = [] } = bodyValidation.right;

      const tagsToAdd = await TagResource.fetchByIds(auth, addTagIds);
      const tagsToRemove = await TagResource.fetchByIds(auth, removeTagIds);

      if (
        tagsToAdd.length !== addTagIds.length ||
        tagsToRemove.length !== removeTagIds.length
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid tag ids",
          },
        });
      }

      if (
        !isBuilder(auth.getNonNullableWorkspace()) &&
        (tagsToAdd.some((tag) => tag.kind === "protected") ||
          tagsToRemove.some((tag) => tag.kind === "protected"))
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Protected tags cannot be added or removed.",
          },
        });
      }

      await Promise.all([
        concurrentExecutor(tagsToAdd, (tag) => tag.addToAgent(auth, agent), {
          concurrency: 10,
        }),
        concurrentExecutor(
          tagsToRemove,
          (tag) => tag.removeFromAgent(auth, agent),
          {
            concurrency: 10,
          }
        ),
      ]);

      const tags = await TagResource.listForAgent(auth, agent.id);

      return res.status(200).json({
        tags: tags.map((t) => t.toJSON()),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
