import type { GetSkillsSpendResponseBody } from "@app/lib/api/skills";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/skills/reinforcement_spend.
const app = workspaceApp();

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
  }
);

export default app;
