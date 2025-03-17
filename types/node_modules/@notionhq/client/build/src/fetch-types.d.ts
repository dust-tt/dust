/// <reference types="node" />
import type { Agent } from "http";
export type SupportedRequestInfo = string;
export type SupportedRequestInit = {
    agent?: Agent;
    body?: string;
    headers?: Record<string, string>;
    method?: string;
};
export type SupportedResponse = {
    ok: boolean;
    text: () => Promise<string>;
    headers: unknown;
    status: number;
};
export type SupportedFetch = (url: SupportedRequestInfo, init?: SupportedRequestInit) => Promise<SupportedResponse>;
//# sourceMappingURL=fetch-types.d.ts.map