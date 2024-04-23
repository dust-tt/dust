import { ioTsEnum } from "../../shared/utils/iots_utils";

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

export const ASSISTANT_BUILDER_DRAWER_TABS = ["Template", "Preview"] as const;

export type AssistantBuilderRightPanelTab =
  (typeof ASSISTANT_BUILDER_DRAWER_TABS)[number];

export type AssistantBuilderRightPanelStatus = {
  openedAt: number | null;
  tab: AssistantBuilderRightPanelTab | null;
};
