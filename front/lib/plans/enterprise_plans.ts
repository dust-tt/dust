import { Attributes } from "sequelize";

import { Plan } from "@app/lib/models";

export type PlanAttributes = Omit<
  Attributes<Plan>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * We have 3 categories of plans:
 * - Free: plans with no paid subscription.
 * - Pro: plans with a paid subscription, not tailored. -> i.e. the same plan is used by all Pro workspaces.
 * - Entreprise: plans with a paid subscription, tailored to the needs of the entreprise. -> i.e. we will have one plan per "Entreprise".
 *
 * This file about Entreprise plans.
 * As entreprise plans are custom, we won't create them in this file, but directly from Poké.
 */

/**
 * ENT_PLAN_FAKE is not subscribable and is only used to display the Enterprise plan in the UI (hence it's not stored on the db).
 */
export const ENT_PLAN_FAKE_CODE = "ENT_PLAN_FAKE_CODE";
export const ENT_PLAN_FAKE_DATA: PlanAttributes = {
  code: ENT_PLAN_FAKE_CODE,
  name: "Entreprise",
  stripeProductId: null,
  maxMessages: -1,
  maxUsersInWorkspace: -1,
  isSlackbotAllowed: true,
  isManagedSlackAllowed: true,
  isManagedNotionAllowed: true,
  isManagedGoogleDriveAllowed: true,
  isManagedGithubAllowed: true,
  maxDataSourcesCount: -1,
  maxDataSourcesDocumentsCount: -1,
  maxDataSourcesDocumentsSizeMb: 2,
};
