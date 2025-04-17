import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import type { InternalToolInputMimeType } from "./internal_mime_types";
export declare const DATA_SOURCE_CONFIGURATION_URI_PATTERN: RegExp;
export declare const TABLE_CONFIGURATION_URI_PATTERN: RegExp;
export declare const CHILD_AGENT_CONFIGURATION_URI_PATTERN: RegExp;
/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 */
export declare const ConfigurableToolInputSchemas: {
    readonly "application/vnd.dust.tool_input.data-source": z.ZodArray<z.ZodObject<{
        uri: z.ZodString;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.data-source">;
    }, "strip", z.ZodTypeAny, {
        mimeType: "application/vnd.dust.tool_input.data-source";
        uri: string;
    }, {
        mimeType: "application/vnd.dust.tool_input.data-source";
        uri: string;
    }>, "many">;
    readonly "application/vnd.dust.tool_input.table": z.ZodArray<z.ZodObject<{
        uri: z.ZodString;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.table">;
    }, "strip", z.ZodTypeAny, {
        mimeType: "application/vnd.dust.tool_input.table";
        uri: string;
    }, {
        mimeType: "application/vnd.dust.tool_input.table";
        uri: string;
    }>, "many">;
    readonly "application/vnd.dust.tool_input.child-agent": z.ZodObject<{
        uri: z.ZodString;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.child-agent">;
    }, "strip", z.ZodTypeAny, {
        mimeType: "application/vnd.dust.tool_input.child-agent";
        uri: string;
    }, {
        mimeType: "application/vnd.dust.tool_input.child-agent";
        uri: string;
    }>;
    readonly "application/vnd.dust.tool_input.string": z.ZodObject<{
        value: z.ZodString;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.string">;
    }, "strip", z.ZodTypeAny, {
        value: string;
        mimeType: "application/vnd.dust.tool_input.string";
    }, {
        value: string;
        mimeType: "application/vnd.dust.tool_input.string";
    }>;
    readonly "application/vnd.dust.tool_input.number": z.ZodObject<{
        value: z.ZodNumber;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.number">;
    }, "strip", z.ZodTypeAny, {
        value: number;
        mimeType: "application/vnd.dust.tool_input.number";
    }, {
        value: number;
        mimeType: "application/vnd.dust.tool_input.number";
    }>;
    readonly "application/vnd.dust.tool_input.boolean": z.ZodObject<{
        value: z.ZodBoolean;
        mimeType: z.ZodLiteral<"application/vnd.dust.tool_input.boolean">;
    }, "strip", z.ZodTypeAny, {
        value: boolean;
        mimeType: "application/vnd.dust.tool_input.boolean";
    }, {
        value: boolean;
        mimeType: "application/vnd.dust.tool_input.boolean";
    }>;
};
export type ConfigurableToolInputType = z.infer<(typeof ConfigurableToolInputSchemas)[InternalToolInputMimeType]>;
/**
 * Mapping between the mime types we used to identify a configurable resource
 * and the JSON schema resulting from the Zod schema defined above.
 */
export declare const ConfigurableToolInputJSONSchemas: Record<InternalToolInputMimeType, JSONSchema>;
//# sourceMappingURL=tool_input_schemas.d.ts.map