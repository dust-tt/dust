import * as t from "io-ts";
declare const SlackAutoReadPatternSchema: t.TypeC<{
    pattern: t.StringC;
    spaceId: t.StringC;
}>;
export type SlackAutoReadPattern = t.TypeOf<typeof SlackAutoReadPatternSchema>;
export declare function isSlackAutoReadPatterns(v: unknown[]): v is SlackAutoReadPattern[];
export declare const SlackConfigurationTypeSchema: t.TypeC<{
    botEnabled: t.BooleanC;
    whitelistedDomains: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC]>;
    autoReadChannelPatterns: t.ArrayC<t.TypeC<{
        pattern: t.StringC;
        spaceId: t.StringC;
    }>>;
}>;
export type SlackConfigurationType = t.TypeOf<typeof SlackConfigurationTypeSchema>;
export type SlackbotWhitelistType = "summon_agent" | "index_messages";
export declare function isSlackbotWhitelistType(value: unknown): value is SlackbotWhitelistType;
export {};
//# sourceMappingURL=slack.d.ts.map