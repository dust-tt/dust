import { ioTsEnum } from "../shared/utils/iots_utils";

export const ASSISTANT_CREATIVITY_LEVELS = [
  "deterministic",
  "factual",
  "balanced",
  "creative",
] as const;
export type AssistantCreativityLevel =
  (typeof ASSISTANT_CREATIVITY_LEVELS)[number];
export const AssistantCreativityLevelCodec = ioTsEnum<AssistantCreativityLevel>(
  ASSISTANT_CREATIVITY_LEVELS,
  "AssistantCreativityLevel"
);
export const ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES = {
  deterministic: "Deterministic",
  factual: "Factual",
  balanced: "Balanced",
  creative: "Creative",
} as const;
export const ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES: Record<
  AssistantCreativityLevel,
  number
> = {
  deterministic: 0.0,
  factual: 0.2,
  balanced: 0.7,
  creative: 1.0,
};

const ASSISTANT_BUILDER_DRAWER_TABS = [
  "Template",
  "Preview",
  "Performance",
] as const;

export type AssistantBuilderRightPanelTabType =
  (typeof ASSISTANT_BUILDER_DRAWER_TABS)[number];

function isAssistantBuilderRightPanelTab(
  value: unknown
): value is AssistantBuilderRightPanelTabType {
  return (
    typeof value === "string" &&
    ASSISTANT_BUILDER_DRAWER_TABS.includes(
      value as AssistantBuilderRightPanelTabType
    )
  );
}
