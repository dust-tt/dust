import * as t from "io-ts";
export declare const TEMPLATES_TAG_CODES: readonly ["CONTENT", "DATA", "DESIGN", "ENGINEERING", "FINANCE", "HIRING", "KNOWLEDGE", "MARKETING", "OPERATIONS", "PRODUCT", "PRODUCT_MANAGEMENT", "PRODUCTIVITY", "SALES", "UX_DESIGN", "UX_RESEARCH", "WRITING"];
export type TemplateTagCodeType = (typeof TEMPLATES_TAG_CODES)[number];
export type TemplateTagsType = Record<TemplateTagCodeType, {
    label: string;
}>;
export declare const TEMPLATES_TAGS_CONFIG: TemplateTagsType;
export declare function isTemplateTagCodeArray(value: unknown): value is TemplateTagCodeType[];
type MultiActionType = "RETRIEVAL_SEARCH" | "DUST_APP_RUN" | "TABLES_QUERY" | "PROCESS" | "WEB_NAVIGATION";
export declare const MULTI_ACTION_PRESETS: Record<MultiActionType, string>;
export type MultiActionPreset = keyof typeof MULTI_ACTION_PRESETS;
export declare const MultiActionPresetCodec: t.Type<MultiActionType, MultiActionType, unknown>;
export declare const TEMPLATE_VISIBILITIES: readonly ["draft", "published", "disabled"];
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];
export declare const TemplateVisibilityCodec: t.Type<"draft" | "published" | "disabled", "draft" | "published" | "disabled", unknown>;
export declare const CreateTemplateFormSchema: t.TypeC<{
    backgroundColor: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    description: t.UnionC<[t.StringC, t.UndefinedC]>;
    emoji: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    handle: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    timeFrameDuration: t.UnionC<[t.StringC, t.UndefinedC]>;
    timeFrameUnit: t.UnionC<[t.Type<"hour" | "day" | "week" | "month" | "year", "hour" | "day" | "week" | "month" | "year", unknown>, t.LiteralC<"">, t.UndefinedC]>;
    helpActions: t.UnionC<[t.StringC, t.UndefinedC]>;
    helpInstructions: t.UnionC<[t.StringC, t.UndefinedC]>;
    presetActions: t.ArrayC<t.TypeC<{
        type: t.Type<MultiActionType, MultiActionType, unknown>;
        name: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
        description: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
        help: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    }>>;
    presetInstructions: t.UnionC<[t.StringC, t.UndefinedC]>;
    presetModelId: t.StringC;
    presetTemperature: t.Type<"deterministic" | "factual" | "balanced" | "creative", "deterministic" | "factual" | "balanced" | "creative", unknown>;
    tags: import("io-ts-types/lib/nonEmptyArray").NonEmptyArrayC<t.KeyofC<{
        CONTENT: {
            label: string;
        };
        DATA: {
            label: string;
        };
        DESIGN: {
            label: string;
        };
        ENGINEERING: {
            label: string;
        };
        FINANCE: {
            label: string;
        };
        HIRING: {
            label: string;
        };
        KNOWLEDGE: {
            label: string;
        };
        MARKETING: {
            label: string;
        };
        OPERATIONS: {
            label: string;
        };
        PRODUCT: {
            label: string;
        };
        PRODUCT_MANAGEMENT: {
            label: string;
        };
        PRODUCTIVITY: {
            label: string;
        };
        SALES: {
            label: string;
        };
        UX_DESIGN: {
            label: string;
        };
        UX_RESEARCH: {
            label: string;
        };
        WRITING: {
            label: string;
        };
    }>>;
    visibility: t.Type<"draft" | "published" | "disabled", "draft" | "published" | "disabled", unknown>;
}>;
export type CreateTemplateFormType = t.TypeOf<typeof CreateTemplateFormSchema>;
export {};
//# sourceMappingURL=templates.d.ts.map