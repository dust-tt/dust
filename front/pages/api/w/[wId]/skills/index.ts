/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { createSkill } from "@app/lib/api/skills/create_skill";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import {
  SKILL_VIEWS,
  type SkillType,
  type SkillViewType,
  type SkillWithoutInstructionsAndToolsType,
  type SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { isBuilder } from "@app/types/user";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type GetSkillsWithoutInstructionsAndToolsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsType[];
};

export type GetSkillsResponseBody = {
  skills: SkillType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillWithRelationsType[];
};

export type PostSkillResponseBody = {
  skill: SkillType;
};

const SkillStatusSchema = z
  .enum(["active", "archived", "suggested"])
  .optional();

function isSkillViewType(value: string): value is SkillViewType {
  return SKILL_VIEWS.some((skillViewType) => skillViewType === value);
}

// Schema for attached knowledge.
export const AttachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});

// Request body schema for POST.
const PostSkillRequestBodySchema = z.intersection(
  z.object({
    name: z.string(),
    agentFacingDescription: z.string(),
    userFacingDescription: z.string(),
    instructions: z.string(),
    icon: z.string().nullable(),
    tools: z.array(
      z.object({
        mcpServerViewId: z.string(),
      })
    ),
    extendedSkillId: z.string().nullable(),
    attachedKnowledge: z.array(AttachedKnowledgeSchema),
    instructionsHtml: z.string().nullable(),
    additionalRequestedSpaceIds: z.array(z.string()).optional(),
    fileAttachments: z.array(z.object({ fileId: z.string() })).optional(),
    isDefault: z.boolean().optional(),
  }),
  z.union([
    z.object({
      source: z.literal("github"),
      sourceMetadata: z.object({
        repoUrl: z.string(),
        filePath: z.string(),
      }),
    }),
    z.object({
      source: z.literal("local_file"),
      sourceMetadata: z.object({ filePath: z.string() }).nullable(),
    }),
    z.object({
      source: z.literal("web_app").optional(),
      sourceMetadata: z.null().optional(),
    }),
  ])
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillsWithoutInstructionsAndToolsResponseBody
      | GetSkillsResponseBody
      | GetSkillsWithRelationsResponseBody
      | PostSkillResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET": {
      const {
        withRelations,
        status,
        globalSpaceOnly,
        onlyCustom,
        isDefault,
        viewType,
      } = req.query;

      let skillView: SkillViewType = "full";
      if (viewType !== undefined) {
        if (!isString(viewType) || !isSkillViewType(viewType)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid viewType: ${viewType}. Expected "full" or "summary".`,
            },
          });
        }

        skillView = viewType;
      }

      if (withRelations === "true" && skillView === "summary") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "viewType=summary is incompatible with withRelations=true.",
          },
        });
      }

      const statusValidation = SkillStatusSchema.safeParse(status);
      if (!statusValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid status: ${status}. Expected "active", "archived", or "suggested".`,
          },
        });
      }
      const skillStatus = statusValidation.data;

      const skills = await SkillResource.listByWorkspace(auth, {
        status: skillStatus,
        globalSpaceOnly: globalSpaceOnly === "true",
        onlyCustom: onlyCustom === "true",
        isDefault: isDefault === "true" ? true : undefined,
        withInstructions: skillView !== "summary",
        withTools: skillView === "full",
      });

      if (withRelations === "true") {
        const extendedSkills = await SkillResource.fetchByIds(
          auth,
          removeNulls(uniq(skills.map((skill) => skill.extendedSkillId)))
        );
        const extendedSkillsMap = new Map(
          extendedSkills.map((skill) => [skill.sId, skill])
        );

        const skillsWithRelations = await concurrentExecutor(
          skills,
          async (sc) => {
            const usage = await sc.fetchUsage(auth);
            const editors = await sc.listEditors(auth);
            const editedByUser = await sc.fetchEditedByUser(auth);

            return {
              ...sc.toJSON(auth),
              relations: {
                usage,
                editors: editors ? editors.map((e) => e.toJSON()) : null,
                editedByUser: editedByUser ? editedByUser.toJSON() : null,
                extendedSkill: sc.extendedSkillId
                  ? (extendedSkillsMap.get(sc.extendedSkillId)?.toJSON(auth) ??
                    null)
                  : null,
              },
            } satisfies SkillWithRelationsType;
          },
          { concurrency: 10 }
        );

        return res.status(200).json({ skills: skillsWithRelations });
      }

      if (skillView === "summary") {
        return res.status(200).json({
          skills: skills.map((sc) => {
            const {
              instructions,
              instructionsHtml,
              tools,
              ...skillWithoutInstructionsAndTools
            } = sc.toJSON(auth);

            return skillWithoutInstructionsAndTools;
          }),
        });
      }

      return res.status(200).json({
        skills: skills.map((sc) => sc.toJSON(auth)),
      });
    }

    case "POST": {
      if (!isBuilder(owner)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "User is not a builder.",
          },
        });
      }

      const bodyValidation = PostSkillRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const result = await createSkill(auth, bodyValidation.data);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: result.error.statusCode,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ skill: result.value });
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
