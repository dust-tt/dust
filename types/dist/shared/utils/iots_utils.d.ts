import * as t from "io-ts";
import { Result } from "../../shared/result";
export declare function ioTsEnum<EnumType>(enumValues: readonly string[], enumName?: string): t.Type<EnumType, EnumType, unknown>;
export interface BrandedRange {
    readonly Range: unique symbol;
}
export declare function createRangeCodec(min: number, max: number): t.BrandC<t.NumberC, BrandedRange>;
interface SlugifiedStringBrand {
    readonly SlugifiedString: unique symbol;
}
export declare const SlugifiedString: t.BrandC<t.StringC, SlugifiedStringBrand>;
export declare function ioTsParsePayload<T>(payload: unknown, codec: t.Type<T>): Result<T, string[]>;
export declare const NumberAsStringCodec: t.Type<string, string, unknown>;
export {};
//# sourceMappingURL=iots_utils.d.ts.map