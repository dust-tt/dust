/** Changes after this point: https://github.com/microsoft/TypeScript/wiki/API-Breaking-Changes#typescript-40 */
import type { default as TsCurrentModule } from "typescript";
import type TsThreeEightModule from "typescript-3";
import type { TsTransformPathsContext } from "../../types";
import type { DownSampleTsTypes } from "../utils";
export type TypeMap = [
    [
        TsCurrentModule.SourceFile,
        TsThreeEightModule.SourceFile
    ],
    [
        TsCurrentModule.StringLiteral,
        TsThreeEightModule.StringLiteral
    ],
    [
        TsCurrentModule.CompilerOptions,
        TsThreeEightModule.CompilerOptions
    ],
    [
        TsCurrentModule.EmitResolver,
        TsThreeEightModule.EmitResolver
    ],
    [
        TsCurrentModule.CallExpression,
        TsThreeEightModule.CallExpression
    ],
    [
        TsCurrentModule.ExternalModuleReference,
        TsThreeEightModule.ExternalModuleReference
    ],
    [
        TsCurrentModule.LiteralTypeNode,
        TsThreeEightModule.LiteralTypeNode
    ],
    [
        TsCurrentModule.ExternalModuleReference,
        TsThreeEightModule.ExternalModuleReference
    ],
    [
        TsCurrentModule.ImportTypeNode,
        TsThreeEightModule.ImportTypeNode
    ],
    [
        TsCurrentModule.EntityName,
        TsThreeEightModule.EntityName
    ],
    [
        TsCurrentModule.TypeNode,
        TsThreeEightModule.TypeNode
    ],
    [
        readonly TsCurrentModule.TypeNode[],
        readonly TsThreeEightModule.TypeNode[]
    ],
    [
        TsCurrentModule.LiteralTypeNode,
        TsThreeEightModule.LiteralTypeNode
    ],
    [
        TsCurrentModule.ImportDeclaration,
        TsThreeEightModule.ImportDeclaration
    ],
    [
        TsCurrentModule.ImportClause,
        TsThreeEightModule.ImportClause
    ],
    [
        TsCurrentModule.Identifier,
        TsThreeEightModule.Identifier
    ],
    [
        TsCurrentModule.NamedImportBindings,
        TsThreeEightModule.NamedImportBindings
    ],
    [
        TsCurrentModule.ImportDeclaration,
        TsThreeEightModule.ImportDeclaration
    ],
    [
        TsCurrentModule.ExportDeclaration,
        TsThreeEightModule.ExportDeclaration
    ],
    [
        TsCurrentModule.ModuleDeclaration,
        TsThreeEightModule.ModuleDeclaration
    ],
    [
        TsCurrentModule.Expression,
        TsThreeEightModule.Expression
    ],
    [
        TsCurrentModule.ModuleBody,
        TsThreeEightModule.ModuleBody
    ],
    [
        TsCurrentModule.ModuleName,
        TsThreeEightModule.ModuleName
    ],
    [
        TsCurrentModule.ExportDeclaration["exportClause"],
        TsThreeEightModule.ExportDeclaration["exportClause"]
    ]
];
export declare const predicate: (context: TsTransformPathsContext) => boolean;
export declare function handler(context: TsTransformPathsContext, prop: string | symbol): (...args: any[]) => any;
export declare function downSample<T extends [...unknown[]]>(...args: T): DownSampleTsTypes<TypeMap, T>;
