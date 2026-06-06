import type {
  GetPokePlansResponseBody,
  UpsertPokePlanResponseBody,
} from "@app/lib/api/poke/plans";
import { PlanTypeSchema } from "@app/lib/api/poke/plans";
import { MAX_DOCUMENT_UPSERT_SIZE_MB } from "@app/lib/data_sources";
import { PlanModel } from "@app/lib/models/plan";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { PlanType } from "@app/types/plan";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/plans. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetPokePlansResponseBody> => {
  const planModels = await PlanModel.findAll({
    order: [["createdAt", "ASC"]],
  });
  const plans: PlanType[] = planModels.map((plan) =>
    renderPlanFromModel({ plan })
  );

  return ctx.json({ plans });
});

app.post(
  "/",
  validate("json", PlanTypeSchema),
  async (ctx): HandlerResult<UpsertPokePlanResponseBody> => {
    const body = ctx.req.valid("json");

    if (
      body.limits.dataSources.documents.sizeMb >= MAX_DOCUMENT_UPSERT_SIZE_MB
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Document size limit must be less than ${MAX_DOCUMENT_UPSERT_SIZE_MB}MB.`,
        },
      });
    }

    const planFields = {
      name: body.name,
      isSlackbotAllowed: body.limits.assistant.isSlackBotAllowed,
      maxImagesPerWeek: body.limits.capabilities.images.maxImagesPerWeek,
      maxMessages: body.limits.assistant.maxMessages,
      maxMessagesTimeframe: body.limits.assistant.maxMessagesTimeframe,
      isDeepDiveAllowed: body.limits.assistant.isDeepDiveAllowed,
      isManagedConfluenceAllowed: body.limits.connections.isConfluenceAllowed,
      isManagedSlackAllowed: body.limits.connections.isSlackAllowed,
      isManagedNotionAllowed: body.limits.connections.isNotionAllowed,
      isManagedGoogleDriveAllowed: body.limits.connections.isGoogleDriveAllowed,
      isManagedGithubAllowed: body.limits.connections.isGithubAllowed,
      isManagedIntercomAllowed: body.limits.connections.isIntercomAllowed,
      isManagedWebCrawlerAllowed: body.limits.connections.isWebCrawlerAllowed,
      isManagedSalesforceAllowed: body.limits.connections.isSalesforceAllowed,
      isSSOAllowed: body.limits.users.isSSOAllowed,
      isSCIMAllowed: body.limits.users.isSCIMAllowed,
      isAuditLogsAllowed: body.isAuditLogsAllowed,
      maxDataSourcesCount: body.limits.dataSources.count,
      maxDataSourcesDocumentsCount: body.limits.dataSources.documents.count,
      maxDataSourcesDocumentsSizeMb: body.limits.dataSources.documents.sizeMb,
      maxUsersInWorkspace: body.limits.users.maxUsers,
      maxFreeUsersInWorkspace: body.limits.users.maxFreeUsers,
      maxLifetimeFreeUsersInWorkspace: body.limits.users.maxLifetimeFreeUsers,
      maxVaultsInWorkspace: body.limits.vaults.maxVaults,
      trialPeriodDays: body.trialPeriodDays,
      canUseProduct: body.limits.canUseProduct,
      isByok: body.isByok,
    };

    let plan = await PlanModel.findOne({ where: { code: body.code } });
    if (plan) {
      await plan.update(planFields);
    } else {
      plan = await PlanModel.create({ code: body.code, ...planFields });
    }

    // Invalidate subscription caches for all workspaces on this plan,
    // since the cached subscription includes a snapshot of plan data.
    await SubscriptionResource.invalidateSubscriptionCacheForPlan(plan.id);

    return ctx.json({ plan: body });
  }
);

export default app;
