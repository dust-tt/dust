/**
 * UPDATE:
 *
 * TODO - In next major version, we can remove this file entirely due to TS PR 57223
 * https://github.com/microsoft/TypeScript/pull/57223
 *
 * This file and its contents are due to an issue in TypeScript (affecting _at least_ up to 4.1) which causes type
 * elision to break during emit for nodes which have been transformed. Specifically, if the 'original' property is set,
 * elision functionality no longer works.
 *
 * This results in module specifiers for types being output in import/export declarations in the compiled _JS files_
 *
 * The logic herein compensates for that issue by recreating type elision separately so that the transformer can update
 * the clause with the properly elided information
 *
 * Issues:
 *
 * - See https://github.com/LeDDGroup/typescript-transform-paths/issues/184
 * - See https://github.com/microsoft/TypeScript/issues/40603
 * - See https://github.com/microsoft/TypeScript/issues/31446
 *
 * @example
 *   // a.ts
 *   export type A = string;
 *   export const B = 2;
 *
 *   // b.ts
 *   import { A, B } from "./b";
 *   export { A } from "./b";
 *
 *   // Expected output for b.js
 *   import { B } from "./b";
 *
 *   // Actual output for b.js
 *   import { A, B } from "./b";
 *   export { A } from "./b";
 */
import { ImportOrExportDeclaration, VisitorContext } from "../types";
import { EmitResolver, StringLiteral } from "typescript";
/**
 * Get import / export clause for node (replicates TS elision behaviour for js files) See notes in
 * get-import-export-clause.ts header for why this is necessary
 *
 * @returns Import or export clause or undefined if it entire declaration should be elided
 */
export declare function elideImportOrExportDeclaration<T extends ImportOrExportDeclaration>(context: VisitorContext, node: T, newModuleSpecifier: StringLiteral, resolver: EmitResolver): T | undefined;
