import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSearchParam } from "@app/lib/platform";
import { serializeSkillTag } from "@app/lib/skills/format";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useContext, useEffect } from "react";

/**
 * Reads the ?skill= search param, fetches the corresponding skill, pre-fills
 * the composer with a skill reference, and cleans up the param from the URL.
 */
export function useSkillFromSearchParam(workspaceId: string) {
  const skillId = useSearchParam("skill");
  const { setPendingInputText } = useContext(InputBarContext);

  const { skill } = useSkill({
    workspaceId,
    skillId,
    disabled: !skillId,
  });

  useEffect(() => {
    if (!skill) {
      return;
    }

    // Keep a space between the prefill and what the user types.
    setPendingInputText(
      `Use ${serializeSkillTag({
        id: skill.sId,
        name: skill.name,
        icon: skill.icon,
      })} for this request: `,
      { replace: true }
    );

    const params = new URLSearchParams(window.location.search);
    if (params.has("skill")) {
      params.delete("skill");
      const queryString = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
      );
    }
  }, [skill, setPendingInputText]);
}
