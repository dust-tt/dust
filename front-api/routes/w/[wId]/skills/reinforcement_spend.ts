import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetSkillsSpendResponseBody = {
  // Map from skill sId to total spent in the current billing period (microUSD).
  // Skills with no usage in the period are omitted.
  spentMicroUsdBySkillId: Record<string, number>;
};

// Mounted at /api/w/:wId/skills/reinforcement_spend.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSkillsSpendResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can view self-improving skills spend.",
      },
    });
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

  return ctx.json({ spentMicroUsdBySkillId });
});

export default app;
