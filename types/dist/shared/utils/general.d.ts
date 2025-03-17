/**
 *  Filters out nulls & undefineds from an array by correclty narrowing the type
 */
export declare function removeNulls<T>(arr: (T | null | undefined)[]): T[];
export declare function isString(value: unknown): value is string;
export declare function isEmptyString(str: string | null | undefined): boolean;
//# sourceMappingURL=general.d.ts.map