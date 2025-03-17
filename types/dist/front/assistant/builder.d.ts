export declare const ASSISTANT_CREATIVITY_LEVELS: readonly ["deterministic", "factual", "balanced", "creative"];
export type AssistantCreativityLevel = (typeof ASSISTANT_CREATIVITY_LEVELS)[number];
export declare const AssistantCreativityLevelCodec: import("io-ts").Type<"deterministic" | "factual" | "balanced" | "creative", "deterministic" | "factual" | "balanced" | "creative", unknown>;
export declare const ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES: {
    readonly deterministic: "Deterministic";
    readonly factual: "Factual";
    readonly balanced: "Balanced";
    readonly creative: "Creative";
};
export declare const ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES: Record<AssistantCreativityLevel, number>;
export declare const ASSISTANT_BUILDER_DRAWER_TABS: readonly ["Template", "Preview", "Performance"];
export type AssistantBuilderRightPanelTab = (typeof ASSISTANT_BUILDER_DRAWER_TABS)[number];
export type AssistantBuilderRightPanelStatus = {
    openedAt: number | null;
    tab: AssistantBuilderRightPanelTab | null;
};
//# sourceMappingURL=builder.d.ts.map