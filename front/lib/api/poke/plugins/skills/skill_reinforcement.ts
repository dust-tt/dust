import { createPlugin } from "@app/lib/api/poke/types";
import type { SkillReinforcementMode } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import { Err, Ok } from "@app/types/shared/result";

function isSkillReinforcementMode(
  value: string
): value is SkillReinforcementMode {
  return (SKILL_REINFORCEMENT_MODES as readonly string[]).includes(value);
}

export const skillReinforcementPlugin = createPlugin({
  manifest: {
    id: "skill-reinforcement",
    name: "Change Skill Reinforcement",
    description: "Change the reinforcement mode for this skill (on, off, auto)",
    resourceTypes: ["skills"],
    args: {
      reinforcement: {
        type: "enum",
        label: "Reinforcement Mode",
        description: "The reinforcement mode for this skill",
        async: true,
        values: [],
        multiple: false,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Skill not found"));
    }

    const currentMode = resource.reinforcement ?? "auto";

    return new Ok({
      reinforcement: SKILL_REINFORCEMENT_MODES.map((mode) => ({
        label: mode,
        value: mode,
        checked: mode === currentMode,
      })),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Skill not found"));
    }

    const reinforcement = args.reinforcement?.[0];
    if (!reinforcement || !isSkillReinforcementMode(reinforcement)) {
      return new Err(new Error("Invalid reinforcement mode"));
    }

    await resource.updateReinforcement(reinforcement);

    return new Ok({
      display: "text",
      value: `Skill reinforcement mode set to "${reinforcement}".`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active";
  },
});
