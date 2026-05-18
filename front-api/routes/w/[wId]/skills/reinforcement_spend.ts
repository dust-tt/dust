import { Hono } from "hono";

import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";

export type GetSkillsSpendResponseBody = {
  // Map from skill sId to total spent in the current billing period (microUSD).
  // Skills with no usage in the period are omitted.
  spentMicroUsdBySkillId: Record<string, number>;
};

// Mounted at /api/w/:wId/skills/reinforcement_spend.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only admins can view self-improving skills spend.",
        },
      },
      403
    );
  }

  const skills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
  });

  const spentByModelId =
    await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdWithMarkupAfterDateForSkills(
      auth,
      {
        createdAfter: (await getCurrentPeriod(auth)).cycleStart,
        skillModelIds: skills.map((sc) => sc.id),
      }
    );

  const spentMicroUsdBySkillId: Record<string, number> = {};
  for (const skill of skills) {
    const spent = spentByModelId.get(skill.id);
    if (spent && spent > 0) {
      spentMicroUsdBySkillId[skill.sId] = spent;
    }
  }

  return c.json({ spentMicroUsdBySkillId });
});

export default app;
