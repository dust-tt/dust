import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { validatePodFileTabs } from "@app/lib/api/projects/file_tabs";
import { validatePinnedFramePath } from "@app/lib/api/projects/pinned_frame";
import { hasFeatureFlag } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  GetPodMetadataResponseBody,
  PatchPodMetadataResponseBody,
} from "@app/types/api/projects/metadata";
import { PatchPodMetadataBodySchema } from "@app/types/api/spaces";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/project_metadata. All routes
// require the space to be a project; this is checked inline per handler.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetPodMetadataResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    return ctx.json({
      projectMetadata: metadata ? metadata.toJSON() : null,
    });
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchPodMetadataBodySchema),
  async (ctx): HandlerResult<PatchPodMetadataResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    if (!auth.can("admin", space)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only project editors can update project metadata.",
        },
      });
    }

    const body = ctx.req.valid("json");

    if (body.isAdminControlled !== undefined) {
      if (!(await hasFeatureFlag(auth, "admin_controlled_pods"))) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message:
              "Admin-controlled Pods are not enabled for this workspace.",
          },
        });
      }

      // biome-ignore lint/plugin/noDirectRoleCheck: endpoint can be called by any authenticated user.
      if (!auth.isAdmin()) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only workspace admins can change admin-controlled Pod mode.",
          },
        });
      }

      if (space.managementMode !== "manual") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Admin-controlled mode requires manual membership management.",
          },
        });
      }
    }

    if (body.pinnedFramePath !== undefined) {
      const validation = await validatePinnedFramePath(
        auth,
        space,
        body.pinnedFramePath
      );
      if (validation.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: validation.error.message,
          },
        });
      }
    }

    let resolvedFileTabs: {
      fileTabs: NonNullable<typeof body.frameTabs>;
      tabsOrder: string[];
    } | null = null;
    if (body.frameTabs !== undefined || body.tabsOrder !== undefined) {
      if (body.frameTabs === undefined || body.tabsOrder === undefined) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "frameTabs and tabsOrder must be provided together.",
          },
        });
      }

      if (!(await hasFeatureFlag(auth, "pod_frame_tabs"))) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Pod file tabs are not enabled for this workspace.",
          },
        });
      }

      const existingMetadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        space
      );
      const existingFileTabPaths = new Set(
        (existingMetadata?.frameTabs ?? [])
          .map((tab) =>
            resolveCanonicalScopedPath(tab.path, {
              conversationId: null,
              spaceId: space.sId,
            })
          )
          .filter((path): path is string => path !== null)
      );

      const validation = await validatePodFileTabs(
        auth,
        space,
        body.frameTabs,
        body.tabsOrder,
        { existingFileTabPaths }
      );
      if (validation.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: validation.error.message,
          },
        });
      }
      resolvedFileTabs = validation.value;
    }

    // Validate the default agent exists and is usable (handles both global agents like
    // "claude-4.5-sonnet" and workspace agents). A null value clears the default (@dust).
    if (body.defaultAgentId) {
      const agent = await getAgentConfiguration(auth, {
        agentId: body.defaultAgentId,
        variant: "extra_light",
      });
      if (!agent || agent.status !== "active") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Agent "${body.defaultAgentId}" was not found or is not usable by the authenticated user.`,
          },
        });
      }
    }

    let resolvedDefaultSkills: SkillResource[] | null = null;
    if (body.defaultSkillIds !== undefined) {
      const requestedSkillIds = [...new Set(body.defaultSkillIds)];
      const skills = await SkillResource.fetchByIds(auth, requestedSkillIds);
      const skillBySId = new Map(skills.map((skill) => [skill.sId, skill]));

      const validatedSkills: SkillResource[] = [];
      for (const skillId of requestedSkillIds) {
        const skill = skillBySId.get(skillId);
        if (!skill || skill.status !== "active") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Skill "${skillId}" was not found, is not active, or is not usable as a default skill.`,
            },
          });
        }
        validatedSkills.push(skill);
      }
      resolvedDefaultSkills = validatedSkills;
    }

    let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

    const priorIsAdminControlled = metadata?.isAdminControlled ?? false;

    if (
      body.isAdminControlled !== undefined &&
      body.isAdminControlled !== priorIsAdminControlled
    ) {
      const membershipRes = await space.applyAdminControlledMembershipChange(
        auth,
        body.isAdminControlled
      );
      if (membershipRes.isErr()) {
        switch (membershipRes.error.code) {
          case "unauthorized":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message: membershipRes.error.message,
              },
            });
          case "group_requirements_not_met":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: membershipRes.error.message,
              },
            });
          default:
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: membershipRes.error.message,
              },
            });
        }
      }
    }

    if (!metadata) {
      metadata = await ProjectMetadataResource.makeNew(auth, space, {
        description: body.description ?? null,
        archivedAt: body.archive ? new Date() : null,
        // Automated task generation removed; keep columns with hardcoded defaults.
        todoGenerationEnabled: false,
        initialTodoAnalysisLookback: null,
        pinnedFramePath: body.pinnedFramePath ?? null,
        frameTabs: resolvedFileTabs?.fileTabs ?? [],
        tabsOrder: resolvedFileTabs?.tabsOrder ?? [],
        defaultAgentId: body.defaultAgentId ?? null,
        isAdminControlled: body.isAdminControlled ?? false,
      });
      if (resolvedDefaultSkills) {
        await metadata.setDefaultSkills(resolvedDefaultSkills);
      }
    } else {
      if (body.archive !== undefined) {
        if (body.archive) {
          await metadata.archive();
        } else {
          await metadata.unarchive();
        }
      }
      if (body.description !== undefined) {
        await metadata.updateDescription(body.description);
      }
      // todoGenerationEnabled / initialTodoAnalysisLookback are accepted for
      // backwards compatibility but ignored (hardcoded off).
      if (body.pinnedFramePath !== undefined) {
        await metadata.updatePinnedFramePath(body.pinnedFramePath);
      }
      if (resolvedFileTabs) {
        await metadata.updateFileTabs(
          resolvedFileTabs.fileTabs,
          resolvedFileTabs.tabsOrder
        );
      }
      if (body.defaultAgentId !== undefined) {
        await metadata.updateDefaultAgentId(body.defaultAgentId);
      }
      if (body.isAdminControlled !== undefined) {
        await metadata.updateIsAdminControlled(body.isAdminControlled);
      }
      if (resolvedDefaultSkills) {
        await metadata.setDefaultSkills(resolvedDefaultSkills);
      }
    }

    if (resolvedDefaultSkills) {
      const refreshed = await ProjectMetadataResource.fetchBySpace(auth, space);
      if (refreshed) {
        metadata = refreshed;
      }
    }

    return ctx.json({ projectMetadata: metadata.toJSON() });
  }
);

export default app;
