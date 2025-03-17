import * as t from "io-ts";
export declare const InternalPostMessagesRequestBodySchema: t.TypeC<{
    content: t.StringC;
    mentions: t.ArrayC<t.TypeC<{
        configurationId: t.StringC;
    }>>;
    context: t.TypeC<{
        timezone: t.StringC;
        profilePictureUrl: t.UnionC<[t.StringC, t.NullC]>;
    }>;
}>;
export declare const getSupportedInlinedContentType: () => t.UnionC<[t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">, t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">, ...t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">[]]>;
declare const ContentFragmentInputWithContentSchema: t.IntersectionC<[t.IntersectionC<[t.TypeC<{
    title: t.StringC;
}>, t.PartialC<{
    url: t.UnionC<[t.StringC, t.NullC]>;
    supersededContentFragmentId: t.UnionC<[t.StringC, t.NullC]>;
}>]>, t.TypeC<{
    content: t.StringC;
    contentType: t.UnionC<[t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">, t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">, ...t.LiteralC<"text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script">[]]>;
}>]>;
export type ContentFragmentInputWithContentType = t.TypeOf<typeof ContentFragmentInputWithContentSchema>;
declare const ContentFragmentInputWithFileIdSchema: t.IntersectionC<[t.IntersectionC<[t.TypeC<{
    title: t.StringC;
}>, t.PartialC<{
    url: t.UnionC<[t.StringC, t.NullC]>;
    supersededContentFragmentId: t.UnionC<[t.StringC, t.NullC]>;
}>]>, t.TypeC<{
    fileId: t.StringC;
}>]>;
export type ContentFragmentInputWithFileIdType = t.TypeOf<typeof ContentFragmentInputWithFileIdSchema>;
type ContentFragmentInputType = ContentFragmentInputWithContentType | ContentFragmentInputWithFileIdType;
export declare function isContentFragmentInputWithContentType(fragment: ContentFragmentInputType): fragment is ContentFragmentInputWithContentType;
export declare const InternalPostContentFragmentRequestBodySchema: t.IntersectionC<[t.TypeC<{
    context: t.TypeC<{
        profilePictureUrl: t.UnionC<[t.StringC, t.NullC]>;
    }>;
}>, t.IntersectionC<[t.IntersectionC<[t.TypeC<{
    title: t.StringC;
}>, t.PartialC<{
    url: t.UnionC<[t.StringC, t.NullC]>;
    supersededContentFragmentId: t.UnionC<[t.StringC, t.NullC]>;
}>]>, t.TypeC<{
    fileId: t.StringC;
}>]>]>;
export declare const InternalPostConversationsRequestBodySchema: t.TypeC<{
    title: t.UnionC<[t.StringC, t.NullC]>;
    visibility: t.UnionC<[t.LiteralC<"unlisted">, t.LiteralC<"workspace">, t.LiteralC<"deleted">, t.LiteralC<"test">]>;
    message: t.UnionC<[t.TypeC<{
        content: t.StringC;
        mentions: t.ArrayC<t.TypeC<{
            configurationId: t.StringC;
        }>>;
        context: t.TypeC<{
            timezone: t.StringC;
            profilePictureUrl: t.UnionC<[t.StringC, t.NullC]>;
        }>;
    }>, t.NullC]>;
    contentFragments: t.ArrayC<t.IntersectionC<[t.TypeC<{
        context: t.TypeC<{
            profilePictureUrl: t.UnionC<[t.StringC, t.NullC]>;
        }>;
    }>, t.IntersectionC<[t.IntersectionC<[t.TypeC<{
        title: t.StringC;
    }>, t.PartialC<{
        url: t.UnionC<[t.StringC, t.NullC]>;
        supersededContentFragmentId: t.UnionC<[t.StringC, t.NullC]>;
    }>]>, t.TypeC<{
        fileId: t.StringC;
    }>]>]>>;
}>;
export declare const InternalPostBuilderSuggestionsRequestBodySchema: t.UnionC<[t.TypeC<{
    type: t.LiteralC<"name">;
    inputs: t.TypeC<{
        instructions: t.StringC;
        description: t.StringC;
    }>;
}>, t.TypeC<{
    type: t.LiteralC<"emoji">;
    inputs: t.TypeC<{
        instructions: t.StringC;
    }>;
}>, t.TypeC<{
    type: t.LiteralC<"instructions">;
    inputs: t.TypeC<{
        current_instructions: t.StringC;
        former_suggestions: t.ArrayC<t.StringC>;
    }>;
}>, t.TypeC<{
    type: t.LiteralC<"description">;
    inputs: t.TypeC<{
        instructions: t.StringC;
        name: t.StringC;
    }>;
}>]>;
export type BuilderSuggestionsRequestType = t.TypeOf<typeof InternalPostBuilderSuggestionsRequestBodySchema>;
export declare const BuilderSuggestionsResponseBodySchema: t.UnionC<[t.TypeC<{
    status: t.LiteralC<"ok">;
    suggestions: t.UnionC<[t.ArrayC<t.StringC>, t.NullC, t.UndefinedC]>;
}>, t.TypeC<{
    status: t.LiteralC<"unavailable">;
    reason: t.UnionC<[t.LiteralC<"user_not_finished">, t.LiteralC<"irrelevant">]>;
}>]>;
export type BuilderSuggestionsType = t.TypeOf<typeof BuilderSuggestionsResponseBodySchema>;
export declare const BuilderEmojiSuggestionsResponseBodySchema: t.TypeC<{
    suggestions: t.ArrayC<t.TypeC<{
        emoji: t.StringC;
        backgroundColor: t.StringC;
    }>>;
}>;
export type BuilderEmojiSuggestionsType = t.TypeOf<typeof BuilderEmojiSuggestionsResponseBodySchema>;
export declare const InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema: t.TypeC<{
    instructions: t.StringC;
}>;
export {};
//# sourceMappingURL=assistant.d.ts.map