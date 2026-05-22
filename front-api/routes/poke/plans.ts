import { PlanModel } from "@app/lib/models/plan";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { config as documentBodyParserConfig } from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";
import type { PlanType } from "@app/types/plan";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type GetPokePlansResponseBody = {
  plans: PlanType[];
};

export type UpsertPokePlanResponseBody = {
  plan: PlanType;
};

export const PlanTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
  limits: z.object({
    assistant: z.object({
      isSlackBotAllowed: z.boolean(),
      maxMessages: z.number(),
      maxMessagesTimeframe: z.enum(["day", "lifetime"]),
      isDeepDiveAllowed: z.boolean(),
    }),
    capabilities: z.object({
      images: z.object({
        maxImagesPerWeek: z.number(),
      }),
    }),
    connections: z.object({
      isConfluenceAllowed: z.boolean(),
      isSlackAllowed: z.boolean(),
      isNotionAllowed: z.boolean(),
      isGoogleDriveAllowed: z.boolean(),
      isGithubAllowed: z.boolean(),
      isIntercomAllowed: z.boolean(),
      isWebCrawlerAllowed: z.boolean(),
      isSalesforceAllowed: z.boolean(),
    }),
    dataSources: z.object({
      count: z.number(),
      documents: z.object({
        count: z.number(),
        sizeMb: z.number(),
      }),
    }),
    users: z.object({
      maxUsers: z.number(),
      maxFreeUsers: z.number(),
      maxLifetimeFreeUsers: z.number(),
      isSSOAllowed: z.boolean(),
      isSCIMAllowed: z.boolean(),
    }),
    vaults: z.object({
      maxVaults: z.number(),
    }),
    canUseProduct: z.boolean(),
  }),
  trialPeriodDays: z.number(),
  isByok: z.boolean(),
  isAuditLogsAllowed: z.boolean(),
});

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

    const { sizeLimit } = documentBodyParserConfig.api.bodyParser;
    const maxSizeMb = parseInt(sizeLimit.replace("mb", ""), 10);

    if (body.limits.dataSources.documents.sizeMb >= maxSizeMb) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Document size limit must be less than ${maxSizeMb}MB.`,
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
