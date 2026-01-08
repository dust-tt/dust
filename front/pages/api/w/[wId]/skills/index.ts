import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillsResponseBody = {
  skills: SkillType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillWithRelationsType[];
};

export type PostSkillResponseBody = {
  skill: SkillType;
};

// Schema for GET status query parameter.
const SkillStatusSchema = t.union([
  t.literal("active"),
  t.literal("archived"),
  t.literal("suggested"),
  t.undefined,
]);

// Schema for attached knowledge.
export const AttachedKnowledgeSchema = t.type({
  dataSourceViewId: t.string,
  nodeId: t.string,
  spaceId: t.string,
  title: t.string,
});

// Request body schema for POST.
const PostSkillRequestBodySchema = t.type({
  name: t.string,
  agentFacingDescription: t.string,
  userFacingDescription: t.string,
  instructions: t.string,
  icon: t.union([t.string, t.null]),
  tools: t.array(
    t.type({
      mcpServerViewId: t.string,
    })
  ),
  extendedSkillId: t.union([t.string, t.null]),
  attachedKnowledge: t.array(AttachedKnowledgeSchema),
});

type PostSkillRequestBody = t.TypeOf<typeof PostSkillRequestBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillsResponseBody
      | GetSkillsWithRelationsResponseBody
      | PostSkillResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!isBuilder(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skills are not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { withRelations, status, globalSpaceOnly } = req.query;

      const statusValidation = SkillStatusSchema.decode(status);
      if (isLeft(statusValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid status: ${status}. Expected "active", "archived", or "suggested".`,
          },
        });
      }
      const skillStatus = statusValidation.right;

      const skills = await SkillResource.listSkills(auth, {
        status: skillStatus,
        globalSpaceOnly: globalSpaceOnly === "true",
      });

      if (withRelations === "true") {
        const skillsWithRelations = await concurrentExecutor(
          skills,
          async (sc) => {
            const usage = await sc.fetchUsage(auth);
            const editors = await sc.listEditors(auth);
            const author = await sc.fetchAuthor(auth);
            const extendedSkill = sc.extendedSkillId
              ? await SkillResource.fetchById(auth, sc.extendedSkillId)
              : null;

            return {
              ...sc.toJSON(auth),
              relations: {
                usage,
                editors: editors ? editors.map((e) => e.toJSON()) : null,
                author: author ? author.toJSON() : null,
                extendedSkill: extendedSkill
                  ? extendedSkill.toJSON(auth)
                  : null,
              },
            } satisfies SkillWithRelationsType;
          },
          { concurrency: 10 }
        );

        return res.status(200).json({ skills: skillsWithRelations });
      }

      return res.status(200).json({
        skills: skills.map((sc) => sc.toJSON(auth)),
      });
    }

    case "POST": {
      const user = auth.getNonNullableUser();

      const bodyValidation = PostSkillRequestBodySchema.decode(req.body);

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

      const body: PostSkillRequestBody = bodyValidation.right;

      const existingSkill = await SkillResource.fetchActiveByName(
        auth,
        body.name
      );

      if (existingSkill) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${body.name}" already exists.`,
          },
        });
      }

      // Validate all MCP server views exist before creating anything
      const mcpServerViewIds = uniq(body.tools.map((t) => t.mcpServerViewId));
      const mcpServerViews = await MCPServerViewResource.fetchByIds(
        auth,
        mcpServerViewIds
      );

      if (mcpServerViewIds.length !== mcpServerViews.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`,
          },
        });
      }

      // Validate all data source views from attached knowledge exist and user has access.
      const { attachedKnowledge } = body;
      const dataSourceViewIds = uniq(
        attachedKnowledge.map((attachment) => attachment.dataSourceViewId)
      );

      const dataSourceViews = await DataSourceViewResource.fetchByIds(
        auth,
        dataSourceViewIds
      );
      if (dataSourceViews.length !== dataSourceViewIds.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `Data source views not all found, ${dataSourceViews.length} found, ${dataSourceViewIds.length} requested`,
          },
        });
      }

      const dataSourceViewIdMap = new Map(
        dataSourceViews.map((dsv) => [dsv.sId, dsv])
      );

      const attachedKnowledgeWithDataSourceViews = attachedKnowledge.map(
        (attachment) => ({
          dataSourceView: dataSourceViewIdMap.get(attachment.dataSourceViewId)!,
          nodeId: attachment.nodeId,
        })
      );

      const requestedSpaceIds =
        await MCPServerViewResource.listSpaceRequirementsByIds(
          auth,
          mcpServerViewIds
        );

      const extendedSkill = body.extendedSkillId
        ? await SkillResource.fetchById(auth, body.extendedSkillId)
        : null;

      // Only global skills can be extended
      if (
        extendedSkill !== null &&
        (extendedSkill === null || !extendedSkill.isExtendable)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The extended skill with id "${body.extendedSkillId}" cannot be extended.`,
          },
        });
      }

      const skillResource = await SkillResource.makeNew(
        auth,
        {
          status: "active",
          name: body.name,
          agentFacingDescription: body.agentFacingDescription,
          userFacingDescription: body.userFacingDescription,
          instructions: body.instructions,
          authorId: user.id,
          requestedSpaceIds,
          extendedSkillId: body.extendedSkillId,
        },
        {
          mcpServerViews,
          attachedKnowledge: attachedKnowledgeWithDataSourceViews,
        }
      );

      return res.status(200).json({
        skill: skillResource.toJSON(auth),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
