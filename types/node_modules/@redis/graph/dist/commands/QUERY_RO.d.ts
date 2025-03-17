import { RedisCommandArgument, RedisCommandArguments } from '@redis/client/dist/lib/commands';
export { FIRST_KEY_INDEX } from './QUERY';
export declare const IS_READ_ONLY = true;
export declare function transformArguments(graph: RedisCommandArgument, query: RedisCommandArgument, timeout?: number): RedisCommandArguments;
export { transformReply } from './QUERY';
