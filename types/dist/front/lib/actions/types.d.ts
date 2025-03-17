import * as t from "io-ts";
export declare const ActionResponseBaseSchema: t.TypeC<{
    run_id: t.StringC;
    created: t.RefinementC<t.NumberC, number>;
    run_type: t.StringC;
    config: t.UnknownRecordC;
    status: t.TypeC<{
        run: t.StringC;
        blocks: t.ArrayC<t.TypeC<{
            block_type: t.StringC;
            name: t.StringC;
            status: t.StringC;
            success_count: t.RefinementC<t.NumberC, number>;
            error_count: t.RefinementC<t.NumberC, number>;
        }>>;
    }>;
    traces: t.UnknownArrayC;
    specification_hash: t.StringC;
}>;
export type ActionResponseBase = t.TypeOf<typeof ActionResponseBaseSchema>;
export declare function isActionResponseBase(response: unknown): response is ActionResponseBase;
//# sourceMappingURL=types.d.ts.map