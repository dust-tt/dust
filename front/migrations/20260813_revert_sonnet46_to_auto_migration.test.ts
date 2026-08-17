import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import baseLogger from "@app/logger/logger";
import type { AgentModelVersion } from "@app/migrations/20260813_revert_sonnet46_to_auto_migration";
import {
  planAutoRevert,
  revertSonnet46AutoSwitch,
} from "@app/migrations/20260813_revert_sonnet46_to_auto_migration";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentStatus } from "@app/types/assistant/agent";
import {
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

// The 20260810 migration ran at 2026-08-10T16:39:26.539Z; its window closes two hours later.
const BEFORE_WINDOW = new Date("2026-08-10T18:39:00.000Z");
const AFTER_WINDOW = new Date("2026-08-10T18:40:00.000Z");
const JAN = new Date("2026-01-10T00:00:00.000Z");
const FEB = new Date("2026-02-10T00:00:00.000Z");
const MAR = new Date("2026-03-10T00:00:00.000Z");
const MAY = new Date("2026-05-10T00:00:00.000Z");
const JUN = new Date("2026-06-10T00:00:00.000Z");
const RESAVED_AT = new Date("2026-08-12T00:00:00.000Z");

const logger = baseLogger.child({}, { level: "silent" });

interface SeededVersion {
  version: number;
  modelId: ModelIdType;
  reasoningEffort: ReasoningEffort | null;
  createdAt: Date;
  updatedAt?: Date;
  status?: AgentStatus;
}

function makeVersion({
  version,
  modelId,
  reasoningEffort = null,
  createdAt,
}: {
  version: number;
  modelId: ModelIdType;
  reasoningEffort?: ReasoningEffort | null;
  createdAt: Date;
}): AgentModelVersion {
  return { version, modelId, reasoningEffort, createdAt };
}

// The migration wrote `auto` at `none` reasoning.
function autoVersion(version: number, createdAt: Date): AgentModelVersion {
  return makeVersion({
    version,
    modelId: AUTO_MODEL_ID,
    reasoningEffort: "none",
    createdAt,
  });
}

function sonnet46Medium(version: number, createdAt: Date): AgentModelVersion {
  return makeVersion({
    version,
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    reasoningEffort: "medium",
    createdAt,
  });
}

describe("planAutoRevert", () => {
  it("reverts an agent whose earlier version was on a legacy model", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        reasoningEffort: "medium",
        createdAt: JAN,
      }),
      autoVersion(1, MAY),
    ]);

    expect(plan.shouldRevert).toBe(true);
    if (!plan.shouldRevert) {
      return;
    }
    expect(plan.autoVersions.map((v) => v.version)).toEqual([1]);
    expect(plan.deliberateVersion.version).toBe(0);
    expect(plan.switchedVersion.version).toBe(1);
  });

  it("keeps an agent that was genuinely on Sonnet 4.6 medium", () => {
    const plan = planAutoRevert([
      sonnet46Medium(0, JUN),
      autoVersion(1, BEFORE_WINDOW),
    ]);

    expect(plan.shouldRevert).toBe(false);
  });

  it("does not revert an agent with no earlier version to compare against", () => {
    const plan = planAutoRevert([autoVersion(0, JUN)]);

    expect(plan.shouldRevert).toBe(false);
  });

  it("finds the deliberate model more than one version below the switch", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "medium",
        createdAt: FEB,
      }),
      sonnet46Medium(1, MAR),
      autoVersion(2, MAY),
    ]);

    expect(plan.shouldRevert).toBe(true);
    if (!plan.shouldRevert) {
      return;
    }
    expect(plan.autoVersions.map((v) => v.version)).toEqual([2]);
    expect(plan.deliberateVersion.version).toBe(0);
  });

  it("reverts the versions that inherited Auto when the agent was re-saved", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: CLAUDE_OPUS_4_7_MODEL_ID,
        reasoningEffort: "high",
        createdAt: JAN,
      }),
      autoVersion(1, MAY),
      autoVersion(2, RESAVED_AT),
      autoVersion(3, RESAVED_AT),
    ]);

    expect(plan.shouldRevert).toBe(true);
    if (!plan.shouldRevert) {
      return;
    }
    expect(plan.autoVersions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it("stops the run at a version that is not on Auto", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "medium",
        createdAt: FEB,
      }),
      autoVersion(1, MAY),
      makeVersion({
        version: 2,
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "high",
        createdAt: RESAVED_AT,
      }),
      autoVersion(3, RESAVED_AT),
    ]);

    expect(plan.shouldRevert).toBe(true);
    if (!plan.shouldRevert) {
      return;
    }
    expect(plan.autoVersions.map((v) => v.version)).toEqual([1]);
  });

  it("ignores a switch to Auto made after the migration window", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "medium",
        createdAt: FEB,
      }),
      autoVersion(1, AFTER_WINDOW),
    ]);

    expect(plan.shouldRevert).toBe(false);
  });

  it("treats Sonnet 4.6 at another reasoning effort as a deliberate model", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "high",
        createdAt: JUN,
      }),
      autoVersion(1, BEFORE_WINDOW),
    ]);

    expect(plan.shouldRevert).toBe(true);
  });

  it("keeps an agent that never went through Auto", () => {
    const plan = planAutoRevert([
      makeVersion({
        version: 0,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "medium",
        createdAt: FEB,
      }),
    ]);

    expect(plan.shouldRevert).toBe(false);
  });

  it("accepts a version created on the last millisecond of the window", () => {
    const earlier = makeVersion({
      version: 0,
      modelId: GPT_5_5_MODEL_ID,
      reasoningEffort: "medium",
      createdAt: FEB,
    });

    expect(
      planAutoRevert([
        earlier,
        autoVersion(1, new Date("2026-08-10T18:39:26.539Z")),
      ]).shouldRevert
    ).toBe(true);
    expect(
      planAutoRevert([
        earlier,
        autoVersion(1, new Date("2026-08-10T18:39:26.540Z")),
      ]).shouldRevert
    ).toBe(false);
  });
});

async function seedAgent({
  workspace,
  authorId,
  name,
  versions,
}: {
  workspace: LightWorkspaceType;
  authorId: number;
  name: string;
  versions: SeededVersion[];
}): Promise<string> {
  const agentId = generateRandomModelSId("agent");

  for (const version of versions) {
    const providerId: ModelProviderIdType =
      version.modelId === AUTO_MODEL_ID ? "auto" : "anthropic";

    const row = await AgentConfigurationModel.create({
      sId: agentId,
      version: version.version,
      status: version.status ?? "archived",
      scope: "visible",
      name,
      description: "Test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      providerId,
      modelId: version.modelId,
      temperature: 0.7,
      reasoningEffort: version.reasoningEffort,
      maxStepsPerRun: 8,
      reinforcement: "auto",
      requestedSpaceIds: [],
      workspaceId: workspace.id,
      authorId,
    });

    // Sequelize stamps its own timestamps on create, so force them afterwards: `createdAt` is what
    // the migration reads, and `updatedAt` needs to be wrong on purpose to prove it is not used.
    await AgentConfigurationModel.update(
      {
        createdAt: version.createdAt,
        updatedAt: version.updatedAt ?? version.createdAt,
      },
      {
        where: { id: row.id, workspaceId: workspace.id },
        silent: true,
      }
    );
  }

  return agentId;
}

async function readVersions(
  workspace: LightWorkspaceType,
  agentId: string
): Promise<Array<{ modelId: string; reasoningEffort: string | null }>> {
  const versions = await AgentConfigurationModel.findAll({
    where: { workspaceId: workspace.id, sId: agentId },
    order: [["version", "ASC"]],
  });

  return versions.map((version) => ({
    modelId: version.modelId,
    reasoningEffort: version.reasoningEffort,
  }));
}

const SONNET_46_MEDIUM = {
  modelId: CLAUDE_SONNET_4_6_MODEL_ID,
  reasoningEffort: "medium",
};
const AUTO_NONE = { modelId: AUTO_MODEL_ID, reasoningEffort: "none" };

describe("revertSonnet46AutoSwitch", () => {
  it("reverts the swept agents and leaves the others alone", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });

    // Flipped in place from a legacy model that the 20260518 migration had moved to Sonnet 4.6.
    const legacyAgentId = await seedAgent({
      workspace,
      authorId: user.id,
      name: "Legacy model agent",
      versions: [
        {
          version: 0,
          modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
          reasoningEffort: "medium",
          createdAt: JAN,
        },
        {
          version: 1,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: MAY,
          status: "active",
        },
      ],
    });

    // Genuinely on Sonnet 4.6 medium before the sweep: stays on Auto.
    const genuineAgentId = await seedAgent({
      workspace,
      authorId: user.id,
      name: "Genuine sonnet agent",
      versions: [
        {
          version: 0,
          modelId: CLAUDE_SONNET_4_6_MODEL_ID,
          reasoningEffort: "medium",
          createdAt: JUN,
        },
        {
          version: 1,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: BEFORE_WINDOW,
          status: "active",
        },
      ],
    });

    // Re-saved after the sweep: archiving rewrote `updatedAt` on every row, and the new versions
    // inherited Auto.
    const resavedAgentId = await seedAgent({
      workspace,
      authorId: user.id,
      name: "Re-saved agent",
      versions: [
        {
          version: 0,
          modelId: CLAUDE_OPUS_4_7_MODEL_ID,
          reasoningEffort: "high",
          createdAt: JAN,
          updatedAt: RESAVED_AT,
        },
        {
          version: 1,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: MAY,
          updatedAt: RESAVED_AT,
        },
        {
          version: 2,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: RESAVED_AT,
        },
        {
          version: 3,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: RESAVED_AT,
          status: "active",
        },
      ],
    });

    // Auto picked again after the sweep, on top of a non-Auto version.
    const repickedAgentId = await seedAgent({
      workspace,
      authorId: user.id,
      name: "Re-picked auto agent",
      versions: [
        {
          version: 0,
          modelId: GPT_5_5_MODEL_ID,
          reasoningEffort: "medium",
          createdAt: FEB,
        },
        {
          version: 1,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: MAY,
        },
        {
          version: 2,
          modelId: GPT_5_6_LUNA_MODEL_ID,
          reasoningEffort: "high",
          createdAt: RESAVED_AT,
        },
        {
          version: 3,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: RESAVED_AT,
          status: "active",
        },
      ],
    });

    // Never swept: the builder moved to Auto after the window closed.
    const lateAgentId = await seedAgent({
      workspace,
      authorId: user.id,
      name: "Late auto agent",
      versions: [
        {
          version: 0,
          modelId: GPT_5_5_MODEL_ID,
          reasoningEffort: "medium",
          createdAt: FEB,
        },
        {
          version: 1,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
          createdAt: AFTER_WINDOW,
          status: "active",
        },
      ],
    });

    const dryRun = await revertSonnet46AutoSwitch({ execute: false, logger });

    expect(dryRun.revertedAgentIds).toEqual(
      expect.arrayContaining([legacyAgentId, resavedAgentId, repickedAgentId])
    );
    expect(dryRun.revertedAgentIds).not.toContain(genuineAgentId);
    expect(dryRun.revertedAgentIds).not.toContain(lateAgentId);
    expect(await readVersions(workspace, legacyAgentId)).toEqual([
      {
        modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        reasoningEffort: "medium",
      },
      AUTO_NONE,
    ]);

    await revertSonnet46AutoSwitch({ execute: true, logger });

    expect(await readVersions(workspace, legacyAgentId)).toEqual([
      {
        modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        reasoningEffort: "medium",
      },
      SONNET_46_MEDIUM,
    ]);

    expect(await readVersions(workspace, genuineAgentId)).toEqual([
      SONNET_46_MEDIUM,
      AUTO_NONE,
    ]);

    expect(await readVersions(workspace, resavedAgentId)).toEqual([
      { modelId: CLAUDE_OPUS_4_7_MODEL_ID, reasoningEffort: "high" },
      SONNET_46_MEDIUM,
      SONNET_46_MEDIUM,
      SONNET_46_MEDIUM,
    ]);

    expect(await readVersions(workspace, repickedAgentId)).toEqual([
      { modelId: GPT_5_5_MODEL_ID, reasoningEffort: "medium" },
      SONNET_46_MEDIUM,
      { modelId: GPT_5_6_LUNA_MODEL_ID, reasoningEffort: "high" },
      AUTO_NONE,
    ]);

    expect(await readVersions(workspace, lateAgentId)).toEqual([
      { modelId: GPT_5_5_MODEL_ID, reasoningEffort: "medium" },
      AUTO_NONE,
    ]);

    // Rerunning is a no-op for the agents that were reverted.
    const rerun = await revertSonnet46AutoSwitch({ execute: true, logger });

    expect(rerun.revertedAgentIds).not.toContain(legacyAgentId);
    expect(rerun.revertedAgentIds).not.toContain(resavedAgentId);
    expect(rerun.revertedAgentIds).not.toContain(repickedAgentId);
  });
});
