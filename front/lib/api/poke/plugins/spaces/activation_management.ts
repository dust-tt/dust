import { evaluateActivation } from "@app/lib/api/activation/evaluator";
import type {
  ActivationNudgeContext,
  ActivationNudgePushedResourceType,
} from "@app/lib/api/activation/nudge";
import { listActivationPodsByUser } from "@app/lib/api/activation/pods";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  createSpaceAndGroup,
  softDeleteSpaceAndLaunchScrubWorkflow,
} from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import {
  startActivationWorkspaceSchedule,
  startActivationWorkspaceWorkflow,
} from "@app/temporal/activation_scheduler/client";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { createHash } from "crypto";

const LEARNING_SPACE_NAME_SUFFIX = "'s Learning Space";
const GOAL_POD_NAME_SUFFIX = "'s Goal Pod";

const activationManagementLogger = logger.child({
  activity: "activation-management",
});

const GOAL_POD_BOOTSTRAP_SESSION_GOAL =
  "Establish the job contract and the first evidence-backed next move, or confirm that none is warranted yet.";

const GOAL_POD_BOOTSTRAP_PLAYBOOK =
  "This is a newly provisioned Pod. Work areas in the opening block are raw input, not a work area — do not store them verbatim. Interpret them, then decide: durable job contract(s) become Work Areas; operating context (formula, sources, authority, how to judge progress) goes in AGENTS.md; a Skill only if that is the actual highest-value next action after diagnosis, not as a dump of the intent. Time horizons (now / this quarter / this year) may inform diagnosis; they are not separate Work Areas. Diagnose from connected sources. Select one bounded next action only if evidence supports it. Decide ownership (Dust vs human) after selecting the action, then present accordingly. Do not produce a full plan.";

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
  otherUsers: UserResource[],
  kind: ActivationPodKind
): string {
  const creatorFullName = creator.fullName();
  const hasNameCollision = otherUsers.some(
    (otherUser) => otherUser.fullName() === creatorFullName
  );

  const label = hasNameCollision ? creator.email : creatorFullName;
  const suffix =
    kind === "goal" ? GOAL_POD_NAME_SUFFIX : LEARNING_SPACE_NAME_SUFFIX;
  return `${label}${suffix}`;
}

function cohortBucket(workspaceSId: string, userId: string): number {
  const digest = createHash("sha256")
    .update(`${workspaceSId}:${userId}`)
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
    kind = "learning",
  }: {
    pctActivated: number;
    pctNotActivated: number;
    kind?: ActivationPodKind;
  }
): Promise<Result<string[], Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const members = await UserResource.fetchByModelIds(
    memberships.map((membership) => membership.userId)
  );

  const podsByUser = await listActivationPodsByUser(auth, { kind });
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
    kind,
  }: {
    creator: UserResource;
    otherUsers: UserResource[];
    kind: ActivationPodKind;
  }
): Promise<
  Result<{ pod: SpaceResource; activationPod: ActivationPodResource }, Error>
> {
  const workspace = auth.getNonNullableWorkspace();
  const podName = learningSpaceNameForCreator(creator, otherUsers, kind);

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

  if (kind === "learning") {
    await pinActivationSkill(auth, pod);
  }

  // Record the canonical ActivationPod row now that the pod's owner is known.
  // `isEligibleForNudge` and the activation scheduler rely on this row to find
  // the pod, so it must exist for the pod to ever be nudged.
  const activationPod = await ActivationPodResource.makeNew(auth, {
    pod,
    user: creator,
    kind,
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
  userId: string;
  status: "provisioned" | "recreated" | "queued" | "failed";
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
      "Each user who already has one is reused, then the selected users are queued into " +
      "the activation Temporal workflow so the same eligibility gates as the daily " +
      "scheduler apply, and the nudge is sent immediately rather than waiting for " +
      "a workday slot. Use Work Areas to seed the user's " +
      "Work Areas for the first conversation. Check 'Force " +
      "recreate' to delete and rebuild an existing Pod from scratch. " +
      "Use 'Who to target' to pick specific users, a group, or a deterministic " +
      "percentage cohort of active members who don't have a Pod yet. " +
      "Choose [Experimental] Goal Pod to keep a job moving instead of training someone on Dust.",
    resourceTypes: ["workspaces"],
    warning: "Large groups can take several minutes.",
    args: {
      podType: {
        type: "enum",
        label: "Pod type",
        description:
          "A Learning Space helps someone get going on Dust. A Goal Pod keeps a job moving.",
        values: [
          { label: "Learning Space", value: "learning", checked: true },
          { label: "[Experimental] Goal Pod", value: "goal" },
        ],
        multiple: false,
      },
      goal: {
        type: "text",
        label: "What should this Pod keep working on?",
        description:
          "Intent for the first conversation to interpret. Not stored as a work area as-is.",
        dependsOn: { field: "podType", value: "goal" },
      },
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
        dependsOn: { field: "podType", value: "learning" },
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
          "queuing a nudge. Leave unchecked to reuse existing Pods.",
        defaultValue: false,
      },
      overrideChecks: {
        type: "boolean",
        label: "Override eligibility checks",
        description:
          "When checked, skip the frequency cap, unanswered-nudge limit, " +
          "activation-status filter, BYOK skip, and per-run user cap for this " +
          "run only. Daily schedules still apply every gate. Membership and " +
          "credit/seat blocks still apply.",
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
      podType,
      goal,
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
      overrideChecks,
    }
  ) => {
    const workspace = auth.getNonNullableWorkspace();
    const kind = podType?.[0] === "goal" ? "goal" : "learning";
    const isGoalPod = kind === "goal";
    const declaredIntent = goal?.trim() || null;

    if (isGoalPod && !declaredIntent) {
      return new Err(new Error("Say what this Pod should keep working on."));
    }
    if (declaredIntent && declaredIntent.length > 512) {
      return new Err(new Error("Keep that under 512 characters."));
    }

    if (auth.plan()?.isByok && !overrideChecks) {
      return new Err(
        new Error("BYOK workspaces cannot be nudged by Activation.")
      );
    }

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
        kind,
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

    // The curated fields only apply to Learning Spaces when the operator opts
    // into providing guidance; otherwise the nudge runs with no injected
    // context and the agent researches the user on its own. Goal Pods always
    // use the bootstrap playbook, and send declared intent on `workAreas` —
    // the Goal skill interprets that as raw input, not a work area as-is.
    const useGuidance = !isGoalPod && guidance?.[0] === "curated";

    const resolvedPushedResource = useGuidance
      ? await resolvePushedResource(auth, pushedResource?.[0])
      : new Ok(null);
    if (resolvedPushedResource.isErr()) {
      return resolvedPushedResource;
    }
    const pushed = resolvedPushedResource.value;

    let context: ActivationNudgeContext = {
      sessionGoal: null,
      pushedResourceType: null,
      pushedResourceName: null,
      workAreas: null,
      activationPlaybook: null,
    };
    if (isGoalPod) {
      context = {
        sessionGoal: GOAL_POD_BOOTSTRAP_SESSION_GOAL,
        pushedResourceType: null,
        pushedResourceName: null,
        workAreas: declaredIntent,
        activationPlaybook: GOAL_POD_BOOTSTRAP_PLAYBOOK,
      };
    } else if (useGuidance) {
      context = {
        sessionGoal: sessionGoal?.trim() || null,
        pushedResourceType: pushed?.type ?? null,
        pushedResourceName: pushed?.name ?? null,
        workAreas: workAreas?.trim() || null,
        activationPlaybook: activationPlaybook?.trim() || null,
      };
    }

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );

    const existingPodsByUser = await listActivationPodsByUser(adminAuth, {
      kind,
    });

    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    const outcomes: TargetOutcome[] = [];
    // Sequential to avoid straining the connection pool: provisioning a pod is
    // a multi-step write and a whole group may be selected at once.
    for (const user of users) {
      const name = user.fullName() || user.email;

      const existing = existingPodsByUser.get(user.id);

      // Reuse path: the user already has a Pod of this kind and we're not
      // recreating it — queue them for the shared Temporal workflow.
      if (existing && !forceRecreate) {
        outcomes.push({
          name,
          userId: user.sId,
          status: "queued",
          podLink: podLink(existing.pod),
        });
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
            userId: user.sId,
            status: "failed",
            message: `failed to delete existing Pod: ${deleteResult.error.message}`,
          });
          continue;
        }
      }

      const otherUsers = users.filter((u) => u.sId !== user.sId);
      const provisionResult = await provisionTrainingPod(adminAuth, {
        creator: user,
        otherUsers,
        kind,
      });
      if (provisionResult.isErr()) {
        outcomes.push({
          name,
          userId: user.sId,
          status: "failed",
          message: provisionResult.error.message,
        });
        continue;
      }

      const { pod } = provisionResult.value;

      outcomes.push({
        name,
        userId: user.sId,
        status: recreated ? "recreated" : "provisioned",
        podLink: podLink(pod),
      });
    }

    const provisioned = outcomes.filter((o) => o.status === "provisioned");
    const recreated = outcomes.filter((o) => o.status === "recreated");
    const queued = outcomes.filter((o) => o.status === "queued");
    const failed = outcomes.filter((o) => o.status === "failed");
    const toNudge = outcomes.filter((o) => o.status !== "failed");

    let workflowId: string | null = null;
    if (toNudge.length > 0) {
      const workflowResult = await startActivationWorkspaceWorkflow({
        workspaceId: workspace.sId,
        userIds: toNudge.map((o) => o.userId),
        overrideChecks: Boolean(overrideChecks),
        context,
      });
      if (workflowResult.isErr()) {
        return new Err(
          new Error(
            `Provisioned users but failed to start the activation workflow: ${workflowResult.error.message}`
          )
        );
      }
      workflowId = workflowResult.value;
    }

    activationManagementLogger.info(
      {
        action: "activation_management",
        workspaceId: workspace.sId,
        kind,
        targetCount: users.length,
        provisionedCount: provisioned.length,
        recreatedCount: recreated.length,
        queuedCount: queued.length,
        failedCount: failed.length,
        forceRecreate: Boolean(forceRecreate),
        overrideChecks: Boolean(overrideChecks),
        pushedResourceType: context.pushedResourceType,
        hasSessionGoal: context.sessionGoal !== null,
        workflowId,
      },
      "Ran Activation Management via poke"
    );

    const lines: string[] = [];
    const focus = isGoalPod
      ? removeNulls([
          declaredIntent ? `declared intent "${declaredIntent}"` : null,
        ])
      : removeNulls([
          context.sessionGoal ? `session goal "${context.sessionGoal}"` : null,
          context.pushedResourceName
            ? `pushing the "${context.pushedResourceName}" ${context.pushedResourceType}`
            : null,
        ]);
    lines.push(
      `Processed ${users.length} user(s)` +
        (focus.length > 0 ? ` — ${focus.join(", ")}.` : ".")
    );
    if (workflowId) {
      lines.push(
        `Queued ${toNudge.length} user(s) into activation workflow \`${workflowId}\`.`
      );
    }
    lines.push("");
    for (const outcome of outcomes) {
      const suffix = outcome.podLink ? ` ([Pod](${outcome.podLink}))` : "";
      if (outcome.status === "failed") {
        lines.push(`- ❌ **${outcome.name}**: ${outcome.message}`);
      } else {
        lines.push(`- ✅ **${outcome.name}**: ${outcome.status}${suffix}`);
      }
    }

    if (failed.length > 0 && failed.length === outcomes.length) {
      return new Err(new Error(lines.join("\n")));
    }

    return new Ok({ display: "markdown", value: lines.join("\n") });
  },
});
