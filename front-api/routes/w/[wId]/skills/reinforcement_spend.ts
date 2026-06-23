import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { GetSkillsSpendResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/skills/reinforcement_spend.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSkillsSpendResponseBody> => {
    const auth = ctx.get("auth");

    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
      onlyCustom: true,
      withInstructions: false,
      withTools: false,
    });

    const spentByModelId =
      await SelfImprovingSkillsUsageResource.getSumSpendWithMarkupAfterDateForSkills(
        auth,
        {
          createdAfter: (await getCurrentPeriod(auth)).cycleStart,
          skillModelIds: skills.map((sc) => sc.id),
        }
      );

    const spentMicroUsdBySkillId: Record<string, number> = {};
    const spentAwuCreditsBySkillId: Record<string, number> = {};
    for (const skill of skills) {
      const spent = spentByModelId.get(skill.id);
      if (!spent) {
        continue;
      }
      if (spent.priceMicroUsd > 0) {
        spentMicroUsdBySkillId[skill.sId] = spent.priceMicroUsd;
      }
      if (spent.priceAwuCredits > 0) {
        spentAwuCreditsBySkillId[skill.sId] = spent.priceAwuCredits;
      }
    }

    return ctx.json({ spentMicroUsdBySkillId, spentAwuCreditsBySkillId });
  }
);

export default app;
