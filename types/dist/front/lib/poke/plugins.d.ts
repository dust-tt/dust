import * as t from "io-ts";
import { LightWorkspaceType } from "../../user";
interface BaseArgDefinition {
    description?: string;
    label: string;
    redact?: boolean;
}
type AtLeastTwoElements<T> = readonly [T, T, ...T[]];
interface EnumArgDefinition extends BaseArgDefinition {
    type: "enum";
    values: AtLeastTwoElements<string>;
}
interface StringArgDefinition extends BaseArgDefinition {
    type: "string";
    values?: never;
}
interface NumberArgDefinition extends BaseArgDefinition {
    type: "number";
    values?: never;
}
interface TextArgDefinition extends BaseArgDefinition {
    type: "text";
    values?: never;
}
interface BooleanArgDefinition extends BaseArgDefinition {
    type: "boolean";
    values?: never;
}
export type PluginArgDefinition = EnumArgDefinition | StringArgDefinition | TextArgDefinition | NumberArgDefinition | BooleanArgDefinition;
export type StrictPluginArgs = {
    [key: string]: PluginArgDefinition;
};
export type PluginArgs = Record<string, PluginArgDefinition>;
export interface PluginManifest<T extends PluginArgs, R extends SupportedResourceType> {
    args: T;
    description: string;
    explanation?: string;
    id: string;
    name: string;
    resourceTypes: R[];
    warning?: string;
}
interface PluginResourceScope {
    resourceType: SupportedResourceType;
}
interface PluginWorkspaceResource extends PluginResourceScope {
    resourceId: string;
    workspace: LightWorkspaceType;
}
export type PluginResourceTarget = PluginResourceScope | PluginWorkspaceResource;
export declare function createIoTsCodecFromArgs(args: PluginArgs): t.TypeC<Record<string, t.Mixed>>;
export declare const supportedResourceTypes: readonly ["apps", "data_source_views", "data_sources", "spaces", "workspaces", "global"];
export type SupportedResourceType = (typeof supportedResourceTypes)[number];
export declare function isSupportedResourceType(resourceType: string): resourceType is SupportedResourceType;
export {};
//# sourceMappingURL=plugins.d.ts.map