import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { GetSkillsReinforcementSettingsResponseBody } from "@app/types/api/skills";
import { isSkillVisibleToViewer } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import pick from "lodash/pick";

/**
 * @cc [owner:aubin-tchoi,label:api] reinforcement-settings-visibility
 * Only workspace admins can list settings. Return active custom skills visible
 * under the standard space and editor permissions, with settings and editor
 * avatars only. Editor identities use sIds.
 */
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSkillsReinforcementSettingsResponseBody> => {
    const auth = ctx.get("auth");
    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
      onlyCustom: true,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });
    const visibleSkills = skills.filter((skill) =>
      isSkillVisibleToViewer({
        availability: skill.availability,
        viewerCanWrite: auth.can("write", skill),
      })
    );
    const editorsBySkillId = await SkillResource.batchListEditors(
      auth,
      visibleSkills
    );

    return ctx.json({
      skills: visibleSkills.map((skill) => {
        const serializedSkill = skill.toJSON(auth);
        return {
          ...pick(serializedSkill, [
            "sId",
            "name",
            "icon",
            "reinforcement",
            "selfImprovementLock",
            "selfImprovementCostsCapMicroUsd",
            "selfImprovementCostsCapAwuCredits",
          ]),
          isDustProvided: serializedSkill.editedBy === null,
          editors:
            editorsBySkillId
              .get(skill.sId)
              ?.map((editor) =>
                pick(editor.toJSON(), ["sId", "fullName", "image"])
              ) ?? null,
        };
      }),
    });
  }
);

export default app;
