/** Changes after this point: https://github.com/microsoft/TypeScript/wiki/API-Breaking-Changes#typescript-48 */
import type { default as TsCurrentModule } from "typescript";
import type TsFourSevenModule from "typescript-4.7";
import type { TsTransformPathsContext } from "../../types";
import type { DownSampleTsTypes } from "../utils";
export type TypeMap = [
    [
        TsCurrentModule.ImportDeclaration,
        TsFourSevenModule.ImportDeclaration
    ],
    [
        TsCurrentModule.Modifier,
        TsFourSevenModule.Modifier
    ],
    [
        TsCurrentModule.ImportClause,
        TsFourSevenModule.ImportClause
    ],
    [
        TsCurrentModule.Expression,
        TsFourSevenModule.Expression
    ],
    [
        TsCurrentModule.AssertClause,
        TsFourSevenModule.AssertClause
    ],
    [
        TsCurrentModule.ExportDeclaration,
        TsFourSevenModule.ExportDeclaration
    ],
    [
        TsCurrentModule.NamedExportBindings,
        TsFourSevenModule.NamedExportBindings
    ],
    [
        TsCurrentModule.ModuleDeclaration,
        TsFourSevenModule.ModuleDeclaration
    ],
    [
        TsCurrentModule.ModuleName,
        TsFourSevenModule.ModuleName
    ],
    [
        TsCurrentModule.ModuleBody,
        TsFourSevenModule.ModuleBody
    ]
];
export declare const predicate: ({ tsVersionMajor, tsVersionMinor }: TsTransformPathsContext) => boolean;
export declare function handler(context: TsTransformPathsContext, prop: string | symbol): (...args: any[]) => any;
export declare function downSample<T extends [...unknown[]]>(...args: T): DownSampleTsTypes<TypeMap, T>;
