import type binding from '@rspack/binding';
import type { ResolveCallback } from './config/adapterRuleUse';
export type ResolveContext = {
    contextDependencies?: {
        add: (context: string) => void;
    };
    missingDependencies?: {
        add: (dependency: string) => void;
    };
    fileDependencies?: {
        add: (dependency: string) => void;
    };
};
export type ResourceData = binding.JsResourceData;
export interface ResolveRequest {
    path: string;
    query: string;
    fragment: string;
    descriptionFileData?: string;
    descriptionFilePath?: string;
    fileDependencies?: string[];
    missingDependencies?: string[];
    contextDependencies?: string[];
}
export declare class Resolver {
    #private;
    constructor(binding: binding.JsResolver);
    resolveSync(_context: object, path: string, request: string): string | false;
    resolve(_context: object, path: string, request: string, resolveContext: ResolveContext, callback: ResolveCallback): void;
}
