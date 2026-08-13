import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { validatePodFrameTabs } from "@app/lib/api/projects/frame_tabs";
import { validatePinnedFramePath } from "@app/lib/api/projects/pinned_frame";
import { hasFeatureFlag } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  launchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_task/client";
import type {
  GetPodMetadataResponseBody,
  PatchPodMetadataResponseBody,
} from "@app/types/api/projects/metadata";
import { PatchPodMetadataBodySchema } from "@app/types/api/spaces";
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

    if (!space.canAdministrate(auth)) {
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

    if (body.appSharingEnabled !== undefined) {
      if (!(await hasFeatureFlag(auth, "sandbox_functions"))) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Sandbox Functions are not enabled for this workspace.",
          },
        });
      }

      // An open Pod already lets every workspace member use its apps, so the
      // flag would be redundant. Disabling stays allowed as cleanup.
      if (body.appSharingEnabled && space.isOpen()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "App sharing is only available on restricted Pods: an open Pod's apps are already usable by the whole workspace.",
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

    let resolvedFrameTabs: {
      frameTabs: NonNullable<typeof body.frameTabs>;
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
            message: "Pod frame tabs are not enabled for this workspace.",
          },
        });
      }

      const validation = await validatePodFrameTabs(
        auth,
        space,
        body.frameTabs,
        body.tabsOrder
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
      resolvedFrameTabs = validation.value;
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

    const priorLastTodoAnalysisAt = metadata?.lastTodoAnalysisAt ?? null;
    const priorTodoGenerationEnabled = metadata?.todoGenerationEnabled ?? false;
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

    const shouldTriggerFirstImmediateSync =
      body.todoGenerationEnabled === true &&
      !priorTodoGenerationEnabled &&
      priorLastTodoAnalysisAt === null;

    if (!metadata) {
      metadata = await ProjectMetadataResource.makeNew(auth, space, {
        description: body.description ?? null,
        archivedAt: body.archive ? new Date() : null,
        todoGenerationEnabled: body.todoGenerationEnabled ?? false,
        initialTodoAnalysisLookback: body.initialTodoAnalysisLookback ?? null,
        pinnedFramePath: body.pinnedFramePath ?? null,
        frameTabs: resolvedFrameTabs?.frameTabs ?? [],
        tabsOrder: resolvedFrameTabs?.tabsOrder ?? [],
        defaultAgentId: body.defaultAgentId ?? null,
        isAdminControlled: body.isAdminControlled ?? false,
        appSharingEnabled: body.appSharingEnabled ?? false,
      });
      if (resolvedDefaultSkills) {
        await metadata.setDefaultSkills(resolvedDefaultSkills);
      }
      if (!body.archive) {
        void launchOrSignalProjectTodoWorkflow({
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
        });
      }
      if (shouldTriggerFirstImmediateSync && !body.archive) {
        void startImmediateProjectTodoWorkflowOnce({
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
        });
      }
    } else {
      if (body.archive !== undefined) {
        if (body.archive) {
          await metadata.archive();
          void stopProjectTodoWorkflow({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        } else {
          await metadata.unarchive();
          void launchOrSignalProjectTodoWorkflow({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        }
      }
      if (body.description !== undefined) {
        await metadata.updateDescription(body.description);
      }
      if (body.todoGenerationEnabled !== undefined) {
        await metadata.updateTodoGenerationEnabled(body.todoGenerationEnabled);
        if (!body.todoGenerationEnabled) {
          await metadata.updateInitialTodoAnalysisLookback(null);
        }
      }
      if (body.initialTodoAnalysisLookback !== undefined) {
        await metadata.updateInitialTodoAnalysisLookback(
          body.initialTodoAnalysisLookback
        );
      }
      if (body.pinnedFramePath !== undefined) {
        await metadata.updatePinnedFramePath(body.pinnedFramePath);
      }
      if (resolvedFrameTabs) {
        await metadata.updateFrameTabs(
          resolvedFrameTabs.frameTabs,
          resolvedFrameTabs.tabsOrder
        );
      }
      if (body.defaultAgentId !== undefined) {
        await metadata.updateDefaultAgentId(body.defaultAgentId);
      }
      if (body.isAdminControlled !== undefined) {
        await metadata.updateIsAdminControlled(body.isAdminControlled);
      }
      if (body.appSharingEnabled !== undefined) {
        await metadata.updateAppSharingEnabled(body.appSharingEnabled);
      }
      if (resolvedDefaultSkills) {
        await metadata.setDefaultSkills(resolvedDefaultSkills);
      }
      if (body.todoGenerationEnabled === true && !priorTodoGenerationEnabled) {
        void launchOrSignalProjectTodoWorkflow({
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
        });
      }
      if (shouldTriggerFirstImmediateSync) {
        void startImmediateProjectTodoWorkflowOnce({
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
        });
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
