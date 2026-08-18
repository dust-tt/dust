import { evaluateActivation } from "@app/lib/api/activation/evaluator";
import type {
  ActivationNudgeContext,
  ActivationNudgePushedResourceType,
} from "@app/lib/api/activation/nudge";
import { postActivationNudge } from "@app/lib/api/activation/nudge";
import { listActivationPodsByUser } from "@app/lib/api/activation/pods";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  createSpaceAndGroup,
  softDeleteSpaceAndLaunchScrubWorkflow,
} from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { startActivationWorkspaceSchedule } from "@app/temporal/activation_scheduler/client";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { createHash } from "crypto";

const LEARNING_SPACE_NAME_SUFFIX = "'s Learning Space";

const activationManagementLogger = logger.child({
  activity: "activation-management",
});

// A skill or agent the nudge should drive the user toward. Encoded in the
// picker as "skill:<sId>" / "agent:<sId>" so one control can offer both.
interface PushedResource {
  type: ActivationNudgePushedResourceType;
  sId: string;
  name: string;
}

function encodePushedResource(
  type: ActivationNudgePushedResourceType,
  sId: string
): string {
  return `${type}:${sId}`;
}

function parsePushedResource(
  encoded: string
): { type: ActivationNudgePushedResourceType; sId: string } | null {
  const separatorIndex = encoded.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }
  const type = encoded.slice(0, separatorIndex);
  const sId = encoded.slice(separatorIndex + 1);
  if ((type !== "skill" && type !== "agent") || sId.length === 0) {
    return null;
  }
  return { type, sId };
}

// Pod is named after its owner. If several owners share a full name in the same
// run, the colliding pods fall back to the owner's email for disambiguation.
function learningSpaceNameForCreator(
  creator: UserResource,
  otherUsers: UserResource[]
): string {
  const creatorFullName = creator.fullName();
  const hasNameCollision = otherUsers.some(
    (otherUser) => otherUser.fullName() === creatorFullName
  );

  const label = hasNameCollision ? creator.email : creatorFullName;
  return `${label}${LEARNING_SPACE_NAME_SUFFIX}`;
}

function cohortBucket(workspaceSId: string, userSId: string): number {
  const digest = createHash("sha256")
    .update(`${workspaceSId}:${userSId}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

// Selects the sIds of active workspace members who don't yet own a Pod, keeping
// a deterministic percentage of each activation-status group (activated / not-activated).
async function selectCohortUserSIds(
  auth: Authenticator,
  {
    pctActivated,
    pctNotActivated,
  }: { pctActivated: number; pctNotActivated: number }
): Promise<Result<string[], Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const members = await UserResource.fetchByModelIds(
    memberships.map((membership) => membership.userId)
  );

  const podsByUser = await listActivationPodsByUser(auth);
  const cohort = members.filter((member) => !podsByUser.has(member.id));
  if (cohort.length === 0) {
    return new Ok([]);
  }

  const activationResult = await evaluateActivation(auth, {
    userIds: cohort.map((member) => member.sId),
  });
  if (activationResult.isErr()) {
    return new Err(activationResult.error);
  }
  const byUser = activationResult.value;

  const selected = cohort.filter((member) => {
    const pct =
      byUser.get(member.sId)?.activated === true
        ? pctActivated
        : pctNotActivated;
    return cohortBucket(workspace.sId, member.sId) < pct;
  });

  return new Ok(selected.map((member) => member.sId));
}

// Resolves the encoded picker value to the pushed skill/agent, reading its
// current name for injection and history. Returns Ok(null) when nothing was
// selected.
async function resolvePushedResource(
  auth: Authenticator,
  encoded: string | undefined
): Promise<Result<PushedResource | null, Error>> {
  if (!encoded) {
    return new Ok(null);
  }

  const parsed = parsePushedResource(encoded);
  if (!parsed) {
    return new Err(new Error(`Invalid pushed resource: ${encoded}.`));
  }

  if (parsed.type === "skill") {
    const [skill] = await SkillResource.fetchByIds(auth, [parsed.sId], {
      onlyActive: true,
    });
    if (!skill) {
      return new Err(new Error(`Skill not found: ${parsed.sId}.`));
    }
    return new Ok({ type: "skill", sId: parsed.sId, name: skill.name });
  }

  const [agent] = await getAgentConfigurations(auth, {
    agentIds: [parsed.sId],
    variant: "light",
  });
  if (!agent) {
    return new Err(new Error(`Agent not found: ${parsed.sId}.`));
  }
  return new Ok({ type: "agent", sId: parsed.sId, name: agent.name });
}

// Pins the Activation skill as the Pod's default skill. This is what makes the
// Pod run the activation flow; the user-selected pushed skill/agent is NOT
// pinned — it is injected into the nudge prompt instead.
async function pinActivationSkill(
  auth: Authenticator,
  pod: SpaceResource
): Promise<void> {
  let metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (!metadata) {
    metadata = await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
    });
  }

  const skills = await SkillResource.fetchByIds(auth, [activationSkill.sId], {
    onlyActive: true,
  });
  await metadata.setDefaultSkills(skills);
}

// Provisions a fresh Learning Space owned by `creator`: creates the restricted
// project, pins the Activation skill, and records the canonical ActivationPod
// row.
async function provisionTrainingPod(
  auth: Authenticator,
  {
    creator,
    otherUsers,
  }: {
    creator: UserResource;
    otherUsers: UserResource[];
  }
): Promise<
  Result<{ pod: SpaceResource; activationPod: ActivationPodResource }, Error>
> {
  const workspace = auth.getNonNullableWorkspace();
  const podName = learningSpaceNameForCreator(creator, otherUsers);

  const creatorAuth = await Authenticator.fromUserIdAndWorkspaceId(
    creator.sId,
    workspace.sId
  );
  const createResult = await createSpaceAndGroup(creatorAuth, {
    name: podName,
    isRestricted: true,
    spaceKind: "project",
    managementMode: "manual",
    memberIds: [],
  });
  if (createResult.isErr()) {
    return new Err(new Error(createResult.error.message));
  }
  const pod = createResult.value;

  await pinActivationSkill(auth, pod);

  // Record the canonical ActivationPod row now that the pod's owner is known.
  // `isEligibleForNudge` and the activation scheduler rely on this row to find
  // the pod, so it must exist for the pod to ever be nudged.
  const activationPod = await ActivationPodResource.makeNew(auth, {
    pod,
    user: creator,
  });

  // Ensure the workspace has a running Activation schedule now that it has a
  // pod to nudge: idempotent (a no-op if one already exists).
  const scheduleResult = await startActivationWorkspaceSchedule({
    workspaceId: workspace.sId,
  });
  if (scheduleResult.isErr()) {
    return new Err(
      new Error(
        `Failed to start the Activation Pod schedule: ${scheduleResult.error.message}`
      )
    );
  }

  return new Ok({ pod, activationPod });
}

type TargetOutcome = {
  name: string;
  status: "provisioned" | "recreated" | "nudged" | "failed";
  podLink?: string;
  message?: string;
};

export const activationManagementPlugin = createPlugin({
  manifest: {
    id: "activation-management",
    name: "Activation Management",
    description:
      "Activation gets dormant or low-fluency users real value from Dust. " +
      "Each targeted user gets a personal Learning Space, and the system " +
      "periodically checks who still isn't activated and automatically sends " +
      "them an async nudge — a message that opens a guided conversation moving " +
      "them one concrete step forward. " +
      "Use this tool to drive that by hand. Each user without a Pod gets one provisioned. " +
      "Each user who already has one is reused, then " +
      "everyone selected is nudged with the Session Goal. Use Work Areas to seed the user's " +
      "Work Areas for the first conversation. Check 'Force " +
      "recreate' to delete and rebuild an existing Pod from scratch. " +
      "Use 'Who to target' to pick specific users, a group, or a deterministic " +
      "percentage cohort of active members who don't have a Pod yet.",
    resourceTypes: ["workspaces"],
    warning: "Large groups can take several minutes.",
    args: {
      targetingMode: {
        type: "enum",
        label: "Who to target",
        description:
          "How to pick who gets a Pod: specific users, a whole group, or a " +
          "deterministic percentage cohort of active members who don't have a " +
          "Pod yet (split by activation status).",
        values: [
          { label: "Specific users", value: "users", checked: true },
          { label: "A group", value: "group" },
          { label: "Cohort of new users (by %)", value: "cohort" },
        ],
        multiple: false,
      },
      targetUserIds: {
        type: "enum",
        label: "Users",
        description:
          "Search by name or email. Each selected user gets their own " +
          "Learning Space (or is nudged if they already have one).",
        async: true,
        values: [],
        multiple: true,
        serverSideSearch: true,
        dependsOn: { field: "targetingMode", value: "users" },
      },
      groupId: {
        type: "enum",
        label: "Group",
        description:
          "Provision/nudge every active member of the selected group.",
        async: true,
        values: [],
        multiple: false,
        dependsOn: { field: "targetingMode", value: "group" },
      },
      pctActivated: {
        type: "number",
        label: "% of already-activated users (no Pod)",
        description:
          "Percentage (0–100) of already-activated members without a Pod to " +
          "provision. Coverage is cumulative and idempotent: a given " +
          "percentage always targets the same slice, raising it across runs " +
          "adds the next slice, and re-running it provisions no one new.",
        variant: "spinner",
        default: 0,
        dependsOn: { field: "targetingMode", value: "cohort" },
      },
      pctNotActivated: {
        type: "number",
        label: "% of not-yet-activated users (no Pod)",
        description:
          "Percentage (0–100) of not-yet-activated members without a Pod to " +
          "provision. Same cumulative, idempotent selection as above.",
        variant: "spinner",
        default: 0,
        dependsOn: { field: "targetingMode", value: "cohort" },
      },
      guidance: {
        type: "enum",
        label: "Guidance",
        description:
          "Whether to hand the nudge curated context. Leave on the default to " +
          "let the agent research the user and pick the next step on its own, " +
          "or choose 'Provide curated guidance' to steer it with a session " +
          "goal, a skill/agent to push, work areas, and a playbook.",
        values: [
          {
            label: "No curated information (agent decides)",
            value: "none",
            checked: true,
          },
          { label: "Provide curated guidance", value: "curated" },
        ],
        multiple: false,
      },
      sessionGoal: {
        type: "text",
        label: "Session Goal",
        description:
          "The one concrete outcome this nudge should drive in the user's " +
          "next session. Write it as a specific task tied to their real work, " +
          'e.g. "Help with GTM use cases" or "Set up a Monday digest of open support tickets". It is injected into the ' +
          "conversation as the focus for this run only. Leave blank to let the agent pick the next step " +
          "from the Pod's history and Work Areas.",
        dependsOn: { field: "guidance", value: "curated" },
      },
      pushedResource: {
        type: "enum",
        label: "Skill or agent to drive adoption of",
        description:
          "A single workspace skill or agent the nudge recommends " +
          "during this session.",
        async: true,
        values: [],
        multiple: false,
        dependsOn: { field: "guidance", value: "curated" },
      },
      workAreas: {
        type: "text",
        label: "Work Areas",
        description:
          "Background about the user that Dust keeps in mind across every nudge — " +
          "job title, team, responsibilities, current projects. " +
          "If not provided, the agent will automatically research the user.",
        dependsOn: { field: "guidance", value: "curated" },
      },
      activationPlaybook: {
        type: "text",
        label: "Activation playbook",
        description:
          "Step-by-step playbook or onboarding instructions for activating this user on Dust",
        dependsOn: { field: "guidance", value: "curated" },
      },
      forceRecreate: {
        type: "boolean",
        label: "Force recreate",
        description:
          "Danger: when checked, any existing Pod for a selected user is " +
          "deleted (its space is scrubbed) and rebuilt from scratch before " +
          "nudging. Leave unchecked to reuse existing Pods.",
        defaultValue: false,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth) => {
    const [skills, agents, groups] = await Promise.all([
      SkillResource.listByWorkspace(auth, {
        status: "active",
        globalSpaceOnly: true,
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      }),
      getAgentConfigurationsForView({
        auth,
        agentsGetView: "published",
        variant: "light",
        omitHeavyAttributes: true,
      }),
      GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds: [...MANAGEABLE_GROUP_KINDS],
      }),
    ]);

    const pushedResource = [
      ...skills.map((skill) => ({
        label: `Skill · ${skill.name}`,
        value: encodePushedResource("skill", skill.sId),
        checked: false,
      })),
      ...agents.map((agent) => ({
        label: `Agent · ${agent.name}`,
        value: encodePushedResource("agent", agent.sId),
        checked: false,
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));

    const groupId = groups
      .map((group) => ({
        label: group.name,
        value: group.sId,
        checked: false,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return new Ok({ pushedResource, groupId });
  },
  execute: async (
    auth,
    _resource,
    {
      targetingMode,
      targetUserIds,
      groupId,
      guidance,
      sessionGoal,
      pushedResource,
      workAreas,
      activationPlaybook,
      pctActivated,
      pctNotActivated,
      forceRecreate,
    }
  ) => {
    const workspace = auth.getNonNullableWorkspace();

    const mode = targetingMode?.[0] ?? "users";

    // Resolve the target user set from the selected targeting mode. Every mode
    // produces a list of sIds that flow through the same provision+nudge path.
    let targetUserSIds: string[];
    if (mode === "cohort") {
      const pctActivatedValue = pctActivated ?? 0;
      const pctNotActivatedValue = pctNotActivated ?? 0;
      for (const pct of [pctActivatedValue, pctNotActivatedValue]) {
        if (pct < 0 || pct > 100) {
          return new Err(
            new Error("Cohort percentages must be between 0 and 100.")
          );
        }
      }
      const cohortResult = await selectCohortUserSIds(auth, {
        pctActivated: pctActivatedValue,
        pctNotActivated: pctNotActivatedValue,
      });
      if (cohortResult.isErr()) {
        return cohortResult;
      }
      targetUserSIds = cohortResult.value;
      if (targetUserSIds.length === 0) {
        return new Ok({
          display: "markdown",
          value:
            "No active members without a Pod matched the given percentages — " +
            "nothing to provision.",
        });
      }
    } else if (mode === "group") {
      const groupSId = groupId?.[0]?.trim();
      if (!groupSId) {
        return new Err(new Error("Select a group."));
      }
      const groupResult = await GroupResource.fetchById(auth, groupSId);
      if (groupResult.isErr()) {
        return new Err(
          new Error(`Group not found: ${groupSId} (${groupResult.error.code}).`)
        );
      }
      const members = await groupResult.value.getActiveMembers(auth);
      targetUserSIds = [...new Set(members.map((member) => member.sId))];
      if (targetUserSIds.length === 0) {
        return new Err(new Error("The selected group has no active members."));
      }
    } else {
      const selectedUserIds = (targetUserIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      targetUserSIds = [...new Set(selectedUserIds)];
      if (targetUserSIds.length === 0) {
        return new Err(new Error("Select at least one user."));
      }
    }

    const users = await UserResource.fetchByIds(targetUserSIds);
    const foundUserIds = new Set(users.map((u) => u.sId));
    const missingUserIds = targetUserSIds.filter((id) => !foundUserIds.has(id));
    if (missingUserIds.length > 0) {
      return new Err(
        new Error(`No user(s) found with ID(s): ${missingUserIds.join(", ")}.`)
      );
    }

    // Every target must be an active member of the workspace.
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace,
    });
    const activeUserModelIds = new Set(memberships.map((m) => m.userId));
    const nonMembers = users.filter((u) => !activeUserModelIds.has(u.id));
    if (nonMembers.length > 0) {
      return new Err(
        new Error(
          "User(s) not active member(s) of this workspace: " +
            `${nonMembers.map((u) => u.sId).join(", ")}.`
        )
      );
    }

    // The curated fields only apply when the operator opts into providing
    // guidance; otherwise the nudge runs with no injected context and the agent
    // researches the user on its own.
    const useGuidance = guidance?.[0] === "curated";

    const resolvedPushedResource = useGuidance
      ? await resolvePushedResource(auth, pushedResource?.[0])
      : new Ok(null);
    if (resolvedPushedResource.isErr()) {
      return resolvedPushedResource;
    }
    const pushed = resolvedPushedResource.value;

    const context: ActivationNudgeContext = useGuidance
      ? {
          sessionGoal: sessionGoal?.trim() ? sessionGoal.trim() : null,
          pushedResourceType: pushed?.type ?? null,
          pushedResourceName: pushed?.name ?? null,
          workAreas: workAreas?.trim() ? workAreas.trim() : null,
          activationPlaybook: activationPlaybook?.trim()
            ? activationPlaybook.trim()
            : null,
        }
      : {
          sessionGoal: null,
          pushedResourceType: null,
          pushedResourceName: null,
          workAreas: null,
          activationPlaybook: null,
        };

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );

    // Decide per user whether to provision or nudge based on existing pods.
    const existingPodsByUser = await listActivationPodsByUser(adminAuth);

    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    const outcomes: TargetOutcome[] = [];
    // Sequential to avoid straining the connection pool: provisioning a pod is
    // a multi-step write and a whole group may be selected at once.
    for (const user of users) {
      const name = user.fullName() || user.email;

      const existing = existingPodsByUser.get(user.id);

      // Reuse path: the user already has a Pod and we're not recreating it —
      // just nudge it. Never fails on an existing Pod.
      if (existing && !forceRecreate) {
        const nudgeResult = await postActivationNudge(adminAuth, {
          pod: existing.pod,
          activationPod: existing.activationPod,
          context,
        });
        if (nudgeResult.isErr()) {
          outcomes.push({
            name,
            status: "failed",
            message: nudgeResult.error.message,
          });
        } else {
          outcomes.push({
            name,
            status: "nudged",
            podLink: podLink(existing.pod),
          });
        }
        continue;
      }

      // Force-recreate path: tear down the existing Pod before provisioning a
      // fresh one. Soft-deleting the space launches the scrub workflow, which
      // removes the ActivationPod row, nudges, and trigger; the soft-deleted
      // space is excluded from future lookups so it won't shadow the new Pod.
      const recreated = Boolean(existing);
      if (existing) {
        const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          existing.pod,
          true
        );
        if (deleteResult.isErr()) {
          outcomes.push({
            name,
            status: "failed",
            message: `failed to delete existing Pod: ${deleteResult.error.message}`,
          });
          continue;
        }
      }

      const otherUsers = users.filter((u) => u.sId !== user.sId);
      const provisionResult = await provisionTrainingPod(auth, {
        creator: user,
        otherUsers,
      });
      if (provisionResult.isErr()) {
        outcomes.push({
          name,
          status: "failed",
          message: provisionResult.error.message,
        });
        continue;
      }

      const { pod, activationPod } = provisionResult.value;
      const nudgeResult = await postActivationNudge(adminAuth, {
        pod,
        activationPod,
        context,
      });
      if (nudgeResult.isErr()) {
        outcomes.push({
          name,
          status: "failed",
          message: `${recreated ? "recreated" : "provisioned"} but failed to nudge: ${nudgeResult.error.message}`,
          podLink: podLink(pod),
        });
        continue;
      }

      outcomes.push({
        name,
        status: recreated ? "recreated" : "provisioned",
        podLink: podLink(pod),
      });
    }

    const provisioned = outcomes.filter((o) => o.status === "provisioned");
    const recreated = outcomes.filter((o) => o.status === "recreated");
    const nudged = outcomes.filter((o) => o.status === "nudged");
    const failed = outcomes.filter((o) => o.status === "failed");

    activationManagementLogger.info(
      {
        action: "activation_management",
        workspaceId: workspace.sId,
        targetCount: users.length,
        provisionedCount: provisioned.length,
        recreatedCount: recreated.length,
        nudgedCount: nudged.length,
        failedCount: failed.length,
        forceRecreate: Boolean(forceRecreate),
        pushedResourceType: context.pushedResourceType,
        hasSessionGoal: context.sessionGoal !== null,
      },
      "Ran Activation Management via poke"
    );

    const lines: string[] = [];
    const focus = removeNulls([
      context.sessionGoal ? `session goal "${context.sessionGoal}"` : null,
      context.pushedResourceName
        ? `pushing the "${context.pushedResourceName}" ${context.pushedResourceType}`
        : null,
    ]);
    lines.push(
      `Processed ${users.length} user(s)` +
        (focus.length > 0 ? ` — ${focus.join(", ")}.` : ".")
    );
    lines.push("");
    for (const outcome of outcomes) {
      const suffix = outcome.podLink ? ` ([Pod](${outcome.podLink}))` : "";
      if (outcome.status === "failed") {
        lines.push(`- ❌ **${outcome.name}**: ${outcome.message}`);
      } else {
        lines.push(`- ✅ **${outcome.name}**: ${outcome.status}${suffix}`);
      }
    }

    if (
      failed.length > 0 &&
      provisioned.length === 0 &&
      recreated.length === 0 &&
      nudged.length === 0
    ) {
      return new Err(new Error(lines.join("\n")));
    }

    return new Ok({ display: "markdown", value: lines.join("\n") });
  },
});
