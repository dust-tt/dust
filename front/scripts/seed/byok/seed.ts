import { PlanModel } from "@app/lib/models/plan";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

// The workspace sId created by dust-hive seed.
const WORKSPACE_ID = "DevWkSpace";
const BYOK_PLAN_CODE = "FREE_BYOK";

// Based on FREE_UPGRADED_PLAN with isByok = true.
const FREE_BYOK_PLAN_DATA: PlanAttributes = {
  code: BYOK_PLAN_CODE,
  name: "Free (BYOK)",
  maxMessages: -1,
  maxUsersInWorkspace: -1,
  maxVaultsInWorkspace: -1,
  maxImagesPerWeek: 50,
  maxMessagesTimeframe: "lifetime",
  isDeepDiveAllowed: true,
  isSlackbotAllowed: true,
  isManagedConfluenceAllowed: true,
  isManagedSlackAllowed: true,
  isManagedNotionAllowed: true,
  isManagedGoogleDriveAllowed: true,
  isManagedGithubAllowed: true,
  isManagedIntercomAllowed: true,
  isManagedWebCrawlerAllowed: true,
  isManagedSalesforceAllowed: true,
  isSSOAllowed: true,
  isSCIMAllowed: false,
  maxDataSourcesCount: -1,
  maxDataSourcesDocumentsCount: -1,
  maxDataSourcesDocumentsSizeMb: 2,
  trialPeriodDays: 0,
  canUseProduct: true,
  isByok: true,
};

makeScript({}, async ({ execute }, logger) => {
  const workspace = await WorkspaceResource.fetchById(WORKSPACE_ID);
  if (!workspace) {
    throw new Error(
      `Workspace ${WORKSPACE_ID} not found. Make sure dust-hive seed has run first.`
    );
  }

  // Step 1: Upsert the FREE_BYOK plan.
  if (execute) {
    await PlanModel.upsert(FREE_BYOK_PLAN_DATA, { conflictFields: ["code"] });
    logger.info(`Upserted plan ${BYOK_PLAN_CODE}.`);
  } else {
    logger.info(`[DRYRUN]: Would upsert plan ${BYOK_PLAN_CODE}.`);
  }

  // Step 2: Switch DevWkSpace subscription to the FREE_BYOK plan.
  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  if (activeSubscription?.getPlan().code === BYOK_PLAN_CODE) {
    logger.info(
      `Workspace ${WORKSPACE_ID} already on ${BYOK_PLAN_CODE} — skipping.`
    );
    return;
  }

  if (execute) {
    await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
      workspaceId: WORKSPACE_ID,
      planCode: BYOK_PLAN_CODE,
      endDate: null,
    });
  }

  logger.info(
    `${execute ? "" : "[DRYRUN]: "}Switched ${WORKSPACE_ID} subscription to ${BYOK_PLAN_CODE}.`
  );
});
