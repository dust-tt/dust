import { RedisCommandArgument, RedisCommandArguments } from '@redis/client/dist/lib/commands/index';
import { QueryOptionsBackwardCompatible } from '.';
export declare const FIRST_KEY_INDEX = 1;
export declare function transformArguments(graph: RedisCommandArgument, query: RedisCommandArgument, options?: QueryOptionsBackwardCompatible, compact?: boolean): RedisCommandArguments;
declare type Headers = Array<string>;
declare type Data = Array<string | number | null | Data>;
declare type Metadata = Array<string>;
declare type QueryRawReply = [
    headers: Headers,
    data: Data,
    metadata: Metadata
] | [
    metadata: Metadata
];
export declare type QueryReply = {
    headers: undefined;
    data: undefined;
    metadata: Metadata;
} | {
    headers: Headers;
    data: Data;
    metadata: Metadata;
};
export declare function transformReply(reply: QueryRawReply): QueryReply;
export {};
