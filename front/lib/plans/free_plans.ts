import { Attributes } from "sequelize";

import { Plan } from "@app/lib/models";

type PlanAttributes = Omit<Attributes<Plan>, "id" | "createdAt" | "updatedAt">;

/**
 * This file is used to store the plans data.
 * We never delete plans, we only add new ones.
 */
const FREE_PLANS_DATA: PlanAttributes[] = [
  {
    code: "TEST_PLAN_V0",
    name: "Test",
    maxWeeklyMessages: 50,
    maxUsersInWorkspace: 1,
    isSlackbotAllowed: false,
    isManagedSlackAllowed: false,
    isManagedNotionAllowed: false,
    isManagedGoogleDriveAllowed: false,
    isManagedGithubAllowed: false,
    maxNbStaticDataSources: 10,
    maxNbStaticDocuments: 10,
    maxSizeStaticDataSources: 1000,
  },
  {
    code: "TRIAL_PLAN_V0",
    name: "Free Trial",
    maxWeeklyMessages: -1,
    maxUsersInWorkspace: -1,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    maxNbStaticDataSources: -1,
    maxNbStaticDocuments: -1,
    maxSizeStaticDataSources: -1,
  },
];

export const upsertFreePlans = async () => {
  for (const planData of FREE_PLANS_DATA) {
    await _upsertFreePlan(planData);
  }
};

const _upsertFreePlan = async (planData: PlanAttributes) => {
  const plan = await Plan.findOne({
    where: {
      code: planData.code,
    },
  });
  if (plan === null) {
    await Plan.create(planData);
    console.log(`Free plan ${planData.code} created.`);
  } else {
    await plan.update(planData);
    console.log(`Free plan ${planData.code} updated.`);
  }
};
