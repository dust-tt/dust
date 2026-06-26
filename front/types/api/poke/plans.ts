import {
  MAX_AWU_CREDITS_TIMEFRAMES,
  MAX_MESSAGE_TIMEFRAMES,
  type PlanType,
} from "@app/types/plan";
import { z } from "zod";

export const PlanTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
  limits: z.object({
    assistant: z.object({
      isSlackBotAllowed: z.boolean(),
      maxMessages: z.number(),
      maxMessagesTimeframe: z.enum(MAX_MESSAGE_TIMEFRAMES),
      maxAwuCredits: z.number(),
      maxAwuCreditsTimeframe: z.enum(MAX_AWU_CREDITS_TIMEFRAMES),
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

export type UpsertPokePlanResponseBody = {
  plan: PlanType;
};

export type GetPokePlansResponseBody = {
  plans: PlanType[];
};
