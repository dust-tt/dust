import { parse } from "csv-parse";
import * as fs from "fs";

import { PlanModel } from "@app/lib/models/plan";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { QueryTypes } from "sequelize";
import { z } from "zod";

const BATCH_SIZE = 500;
const LEGACY_FAIR_USE_AWU_CREDITS = 20_000;
const PREMIUM_MODEL_LIMIT_FEATURE_FLAG: WhitelistableFeature =
  "enforce_premium_model_message_limit";
const DISABLE_FAIR_USE_AWU_LIMIT_FEATURE_FLAG: WhitelistableFeature =
  "disable_fair_use_awu_limit";
const LEGACY_TRIGGER_LIMITS_FEATURE_FLAG_NAME = "legacy_trigger_limits";

const ExcludedWorkspaceCsvRowSchema = z.object({
  workspace_id: z.string().trim().min(1),
});

type LegacyPlanWorkspace = {
  id: ModelId;
  sId: string;
  planId: ModelId;
};

async function readExcludedWorkspaceIds(csvPath: string): Promise<Set<string>> {
  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      delimiter: ",",
      skip_empty_lines: true,
      trim: true,
    })
  );
  const workspaceIds = new Set<string>();

  for await (const row of parser) {
    const parsedRow = ExcludedWorkspaceCsvRowSchema.safeParse(row);
    if (!parsedRow.success) {
      throw new Error(`Invalid exclusions CSV: ${parsedRow.error.message}`);
    }
    workspaceIds.add(parsedRow.data.workspace_id);
  }

  return workspaceIds;
}

async function listLegacyPlanWorkspaces(): Promise<LegacyPlanWorkspace[]> {
  return frontSequelize.query<LegacyPlanWorkspace>(
    `
      WITH ranked_subscriptions AS (
        SELECT
          subscriptions."workspaceId",
          plans.id AS "planId",
          plans.code AS "planCode",
          ROW_NUMBER() OVER (
            PARTITION BY subscriptions."workspaceId"
            ORDER BY
              (subscriptions.status = 'active') DESC,
              subscriptions."startDate" DESC,
              subscriptions."createdAt" DESC,
              subscriptions.id DESC
          ) AS rank
        FROM subscriptions
        INNER JOIN plans ON plans.id = subscriptions."planId"
        WHERE NOT (
          subscriptions."endDate" IS NOT NULL
          AND subscriptions."endDate" < NOW()
        )
      )
      SELECT
        workspaces.id,
        workspaces."sId",
        ranked_subscriptions."planId"
      FROM workspaces
      INNER JOIN ranked_subscriptions
        ON ranked_subscriptions."workspaceId" = workspaces.id
        AND ranked_subscriptions.rank = 1
      WHERE SUBSTRING(ranked_subscriptions."planCode" FROM 1 FOR 3) <> 'CP_'
      ORDER BY workspaces.id
    `,
    { type: QueryTypes.SELECT }
  );
}

async function enableFeatureFlagsForWorkspaces(
  workspaces: readonly LegacyPlanWorkspace[],
  featureFlags: readonly WhitelistableFeature[]
): Promise<void> {
  for (let offset = 0; offset < workspaces.length; offset += BATCH_SIZE) {
    const workspaceResources = await WorkspaceResource.fetchByModelIds(
      workspaces
        .slice(offset, offset + BATCH_SIZE)
        .map((workspace) => workspace.id)
    );
    for (const workspace of workspaceResources) {
      await FeatureFlagResource.enableMany(workspace, [...featureFlags]);
    }
  }
}

makeScript(
  {
    csvPath: {
      alias: "csv",
      describe:
        "Path to the CSV file containing workspace_id values to exclude",
      type: "string",
      demandOption: true,
    },
  },
  async ({ csvPath, execute }, logger) => {
    const excludedWorkspaceIds = await readExcludedWorkspaceIds(csvPath);
    const legacyPlanWorkspaces = await listLegacyPlanWorkspaces();
    const excludedLegacyPlanWorkspaces = legacyPlanWorkspaces.filter(
      (workspace) => excludedWorkspaceIds.has(workspace.sId)
    );
    const localLegacyWorkspaceIds = new Set(
      legacyPlanWorkspaces.map((workspace) => workspace.sId)
    );
    const csvWorkspaceNotFoundInRegionCount = [...excludedWorkspaceIds].filter(
      (workspaceId) => !localLegacyWorkspaceIds.has(workspaceId)
    ).length;
    const fairUseEnabledWorkspaces = legacyPlanWorkspaces.filter(
      (workspace) => !excludedWorkspaceIds.has(workspace.sId)
    );
    const legacyPlanModelIds = [
      ...new Set(legacyPlanWorkspaces.map((workspace) => workspace.planId)),
    ];
    const legacyPlans = await PlanModel.findAll({
      where: { id: legacyPlanModelIds },
    });
    const legacyPlansToUpdate = legacyPlans.filter(
      (plan) =>
        plan.maxAwuCredits !== LEGACY_FAIR_USE_AWU_CREDITS ||
        plan.maxAwuCreditsTimeframe !== "week"
    );

    logger.info(
      {
        execute,
        csvWorkspaceNotFoundInRegionCount,
        csvWorkspaceCount: excludedWorkspaceIds.size,
        excludedLegacyPlanWorkspaceCount: excludedLegacyPlanWorkspaces.length,
        fairUseEnabledWorkspaceCount: fairUseEnabledWorkspaces.length,
        legacyPlanCount: legacyPlans.length,
        legacyPlanCodesToUpdate: legacyPlansToUpdate.map((plan) => plan.code),
        legacyPlanWorkspaceCount: legacyPlanWorkspaces.length,
      },
      "Legacy-plan fair-use feature flag migration"
    );

    if (!execute) {
      return;
    }

    if (!isWhitelistableFeature(LEGACY_TRIGGER_LIMITS_FEATURE_FLAG_NAME)) {
      throw new Error(
        `${LEGACY_TRIGGER_LIMITS_FEATURE_FLAG_NAME} is not registered. Merge PR #31465 before executing this migration.`
      );
    }

    for (const plan of legacyPlansToUpdate) {
      await plan.update({
        maxAwuCredits: LEGACY_FAIR_USE_AWU_CREDITS,
        maxAwuCreditsTimeframe: "week",
      });
      await SubscriptionResource.invalidateSubscriptionCacheForPlan(plan.id);
    }

    await enableFeatureFlagsForWorkspaces(fairUseEnabledWorkspaces, [
      PREMIUM_MODEL_LIMIT_FEATURE_FLAG,
    ]);
    await enableFeatureFlagsForWorkspaces(excludedLegacyPlanWorkspaces, [
      DISABLE_FAIR_USE_AWU_LIMIT_FEATURE_FLAG,
      LEGACY_TRIGGER_LIMITS_FEATURE_FLAG_NAME,
    ]);
  }
);
