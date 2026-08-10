/**
 * Backfill the dustRunId stamped on model-produced agent step contents. This must run before the
 * agent message consumption analytics backfill so historical tool calls can be attributed to the
 * run usage that emitted them.
 *
 * Inference:
 * - AgentMessage.runIds is an unordered set, so the script fetches the corresponding Run rows and
 *   orders them by createdAt, then model id.
 * - Agent-loop step N is matched to chronological run N.
 * - The content timestamp must fall at or after run N and before run N+1. If a run is missing or
 *   the chronology does not agree, the content is skipped rather than assigned speculatively.
 *
 * The script considers every agent-message status and only updates null dustRunId values, making
 * reruns safe. An in-progress message may be skipped until its newest run id has been persisted;
 * rerunning after it settles will pick it up. Cache reads compare dustRunId with Postgres metadata,
 * so an entry cached before this backfill is rejected and refreshed rather than serving stale null.
 *
 * Run once in each region.
 *
 * Dry run:
 *   npx tsx scripts/backfill_agent_step_content_dust_run_ids.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z
 *
 * Execute:
 *   npx tsx scripts/backfill_agent_step_content_dust_run_ids.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z \
 *     --execute
 */
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { RunModel } from "@app/lib/resources/storage/models/runs";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DEFAULT_BATCH_SIZE = 500;
const TimestampSchema = z.string().datetime({ offset: true });

type RunCandidate = {
  dustRunId: string;
  createdAt: Date;
  runModelId: ModelId;
};

type StepContentCandidate = {
  createdAt: Date;
  step: number;
};

type StepContentUpdate = {
  dustRunId: string;
  stepContentModelId: ModelId;
};

type StepContentCursor = {
  agentMessageModelId: ModelId;
  index: number;
  step: number;
  version: number;
};

function parseTimestamp(value: string, argumentName: string): Date {
  const result = TimestampSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid --${argumentName}: ${fromError(result.error).toString()}`
    );
  }

  return new Date(result.data);
}

/**
 * Agent message runIds are a set and do not preserve chronological order. Once sorted by the run
 * rows themselves, run position and step number advance together in the agent loop. The timestamp
 * bounds prevent assigning content to a run when missing/duplicate historical data has broken that
 * invariant.
 */
export function inferDustRunIdForStepContent(
  content: StepContentCandidate,
  chronologicalRuns: RunCandidate[]
): string | null {
  const run = chronologicalRuns[content.step];
  if (!run || run.createdAt > content.createdAt) {
    return null;
  }

  const nextRun = chronologicalRuns[content.step + 1];
  if (nextRun && nextRun.createdAt <= content.createdAt) {
    return null;
  }

  return run.dustRunId;
}

export function getChronologicalRunsForAgentMessage(
  dustRunIds: string[],
  runByDustRunId: Map<string, RunCandidate>
): RunCandidate[] | null {
  const uniqueDustRunIds = [...new Set(dustRunIds)];
  const messageRuns = uniqueDustRunIds.flatMap((dustRunId) => {
    const run = runByDustRunId.get(dustRunId);
    return run ? [run] : [];
  });

  // A missing run shifts every later positional match, so do not infer any row for the message.
  if (messageRuns.length !== uniqueDustRunIds.length) {
    return null;
  }

  return messageRuns.toSorted(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.runModelId - right.runModelId
  );
}

async function listStepContentCandidates({
  afterCursor,
  batchSize,
  fromDate,
  toDate,
  workspace,
}: {
  afterCursor: StepContentCursor | null;
  batchSize: number;
  fromDate: Date;
  toDate: Date;
  workspace: LightWorkspaceType;
}): Promise<AgentStepContentModel[]> {
  const afterCursorWhere: WhereOptions<AgentStepContentModel> = afterCursor
    ? {
        [Op.or]: [
          {
            agentMessageId: { [Op.gt]: afterCursor.agentMessageModelId },
          },
          {
            agentMessageId: afterCursor.agentMessageModelId,
            step: { [Op.gt]: afterCursor.step },
          },
          {
            agentMessageId: afterCursor.agentMessageModelId,
            step: afterCursor.step,
            index: { [Op.gt]: afterCursor.index },
          },
          {
            agentMessageId: afterCursor.agentMessageModelId,
            step: afterCursor.step,
            index: afterCursor.index,
            version: { [Op.gt]: afterCursor.version },
          },
        ],
      }
    : {};

  return AgentStepContentModel.findAll({
    attributes: [
      "id",
      "agentMessageId",
      "createdAt",
      "step",
      "index",
      "version",
    ],
    where: {
      ...afterCursorWhere,
      createdAt: { [Op.gte]: fromDate, [Op.lt]: toDate },
      workspaceId: workspace.id,
      dustRunId: null,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id", "runIds"],
        required: true,
        where: {
          workspaceId: workspace.id,
          runIds: { [Op.ne]: null },
        },
      },
    ],
    order: [
      ["agentMessageId", "ASC"],
      ["step", "ASC"],
      ["index", "ASC"],
      ["version", "ASC"],
    ],
    limit: batchSize,
  });
}

async function inferStepContentUpdates({
  candidates,
  workspace,
}: {
  candidates: AgentStepContentModel[];
  workspace: LightWorkspaceType;
}): Promise<StepContentUpdate[]> {
  const dustRunIds = [
    ...new Set(
      candidates.flatMap((candidate) => candidate.agentMessage?.runIds ?? [])
    ),
  ];
  if (dustRunIds.length === 0) {
    return [];
  }

  const runs = await RunModel.findAll({
    attributes: ["id", "dustRunId", "createdAt"],
    where: {
      workspaceId: workspace.id,
      dustRunId: { [Op.in]: dustRunIds },
    },
  });
  const runByDustRunId = new Map(
    runs.map((run) => [
      run.dustRunId,
      {
        dustRunId: run.dustRunId,
        createdAt: run.createdAt,
        runModelId: run.id,
      },
    ])
  );

  const chronologicalRunsByAgentMessageModelId = new Map<
    ModelId,
    RunCandidate[]
  >();

  for (const candidate of candidates) {
    const agentMessage = candidate.agentMessage;
    assert(agentMessage, "Agent message context was not joined");

    if (!chronologicalRunsByAgentMessageModelId.has(agentMessage.id)) {
      chronologicalRunsByAgentMessageModelId.set(
        agentMessage.id,
        getChronologicalRunsForAgentMessage(
          agentMessage.runIds ?? [],
          runByDustRunId
        ) ?? []
      );
    }
  }

  return candidates.flatMap((candidate) => {
    const agentMessage = candidate.agentMessage;
    assert(agentMessage, "Agent message context was not joined");

    const dustRunId = inferDustRunIdForStepContent(
      candidate,
      chronologicalRunsByAgentMessageModelId.get(agentMessage.id) ?? []
    );
    return dustRunId
      ? [
          {
            dustRunId,
            stepContentModelId: candidate.id,
          },
        ]
      : [];
  });
}

async function applyStepContentUpdates({
  updates,
  workspace,
}: {
  updates: StepContentUpdate[];
  workspace: LightWorkspaceType;
}): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  const bind: Record<string, number | string> = {
    workspaceModelId: workspace.id,
  };
  const values = updates.map((update, index) => {
    bind[`stepContentModelId${index}`] = update.stepContentModelId;
    bind[`dustRunId${index}`] = update.dustRunId;
    return `($stepContentModelId${index}::bigint, $dustRunId${index}::text)`;
  });

  // biome-ignore lint/plugin/noRawSql: one bound VALUES query avoids an update query per run.
  const updatedRows = await frontSequelize.query<{ id: string }>(
    `
      WITH mapping("stepContentModelId", "dustRunId") AS (
        VALUES ${values.join(", ")}
      )
      UPDATE "agent_step_contents" AS content
      SET "dustRunId" = mapping."dustRunId"
      FROM mapping
      WHERE content.id = mapping."stepContentModelId"
        AND content."workspaceId" = $workspaceModelId
        AND content."dustRunId" IS NULL
      RETURNING content.id
    `,
    { bind, type: QueryTypes.SELECT }
  );

  return updatedRows.length;
}

function runScript(): void {
  makeScript(
    {
      fromDate: {
        type: "string",
        required: true,
        description: "Inclusive ISO-8601 step content creation timestamp.",
      },
      toDate: {
        type: "string",
        required: false,
        description:
          "Exclusive ISO-8601 step content creation timestamp (defaults to script start).",
      },
      workspaceId: {
        type: "string",
        required: false,
        description: "Single workspace sId to process (all if omitted).",
      },
      fromWorkspaceId: {
        type: "number",
        required: false,
        description: "Resume from this workspace model id.",
      },
      batchSize: {
        type: "number",
        default: DEFAULT_BATCH_SIZE,
        description: "Number of null step content rows to fetch per query.",
      },
    },
    async (
      { batchSize, execute, fromDate, fromWorkspaceId, toDate, workspaceId },
      logger
    ) => {
      const parsedFromDate = parseTimestamp(fromDate, "fromDate");
      const parsedToDate = toDate
        ? parseTimestamp(toDate, "toDate")
        : new Date();
      assert(parsedFromDate < parsedToDate, "--fromDate must precede --toDate");
      assert(batchSize > 0, "--batchSize must be positive");

      let totalCandidates = 0;
      let totalInferred = 0;
      let totalUpdated = 0;

      await runOnAllWorkspaces(
        async (workspace) => {
          let afterCursor: StepContentCursor | null = null;
          let workspaceCandidates = 0;
          let workspaceInferred = 0;
          let workspaceUpdated = 0;

          while (true) {
            const candidates = await listStepContentCandidates({
              afterCursor,
              batchSize,
              fromDate: parsedFromDate,
              toDate: parsedToDate,
              workspace,
            });
            if (candidates.length === 0) {
              break;
            }

            const lastCandidate = candidates[candidates.length - 1];
            afterCursor = {
              agentMessageModelId: lastCandidate.agentMessageId,
              step: lastCandidate.step,
              index: lastCandidate.index,
              version: lastCandidate.version,
            };
            const updates = await inferStepContentUpdates({
              candidates,
              workspace,
            });

            workspaceCandidates += candidates.length;
            workspaceInferred += updates.length;
            if (execute) {
              workspaceUpdated += await applyStepContentUpdates({
                updates,
                workspace,
              });
            }

            logger.info(
              {
                workspaceId: workspace.sId,
                afterCursor,
                workspaceCandidates,
                workspaceInferred,
                workspaceSkipped: workspaceCandidates - workspaceInferred,
                workspaceUpdated,
              },
              "[StepContentDustRunIdBackfill] Batch complete"
            );
          }

          totalCandidates += workspaceCandidates;
          totalInferred += workspaceInferred;
          totalUpdated += workspaceUpdated;

          logger.info(
            {
              workspaceId: workspace.sId,
              workspaceCandidates,
              workspaceInferred,
              workspaceSkipped: workspaceCandidates - workspaceInferred,
              workspaceUpdated,
              execute,
            },
            "[StepContentDustRunIdBackfill] Workspace complete"
          );
        },
        { wId: workspaceId, fromWorkspaceId }
      );

      logger.info(
        {
          fromDate: parsedFromDate.toISOString(),
          toDate: parsedToDate.toISOString(),
          totalCandidates,
          totalInferred,
          totalSkipped: totalCandidates - totalInferred,
          totalUpdated,
          execute,
        },
        "[StepContentDustRunIdBackfill] Backfill complete"
      );
    }
  );
}

if (process.argv[1]?.endsWith("backfill_agent_step_content_dust_run_ids.ts")) {
  runScript();
}
