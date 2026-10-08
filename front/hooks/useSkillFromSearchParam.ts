import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSearchParam } from "@app/lib/platform";
import {
  getConversationalBuildingCreatePrompt,
  isConversationalBuildingTarget,
} from "@app/lib/skills/conversational_building";
import { serializeSkillTag } from "@app/lib/skills/format";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useLingui } from "@lingui/react/macro";
import { useContext, useEffect } from "react";

/**
 * Reads the ?skill= search param, fetches the corresponding skill, pre-fills
 * the composer with a skill reference, and cleans up the param from the URL.
 * An optional ?create=agent|skill param replaces the default suffix with a
 * prompt to create an agent or a skill.
 */
export function useSkillFromSearchParam(workspaceId: string) {
  const skillId = useSearchParam("skill");
  const create = useSearchParam("create");
  const { setPendingInputText } = useContext(InputBarContext);
  const { t } = useLingui();

  const { skill } = useSkill({
    workspaceId,
    skillId,
    disabled: !skillId,
  });

  useEffect(() => {
    if (!skill) {
      return;
    }

    const skillTag = serializeSkillTag({
      id: skill.sId,
      name: skill.name,
      icon: skill.icon,
    });
    setPendingInputText(
      isConversationalBuildingTarget(create)
        ? t(getConversationalBuildingCreatePrompt(create, skillTag))
        : `${t`Use ${skillTag} for this request:`} `,
      { replace: true }
    );

    const params = new URLSearchParams(window.location.search);
    if (params.has("skill") || params.has("create")) {
      params.delete("skill");
      params.delete("create");
      const queryString = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
      );
    }
  }, [skill, create, setPendingInputText, t]);
}
