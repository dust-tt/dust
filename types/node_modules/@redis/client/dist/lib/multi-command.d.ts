import { RedisCommand, RedisCommandArguments, RedisCommandRawReply, RedisFunction, RedisScript } from './commands';
export interface RedisMultiQueuedCommand {
    args: RedisCommandArguments;
    transformReply?: RedisCommand['transformReply'];
}
export default class RedisMultiCommand {
    static generateChainId(): symbol;
    readonly queue: Array<RedisMultiQueuedCommand>;
    readonly scriptsInUse: Set<string>;
    addCommand(args: RedisCommandArguments, transformReply?: RedisCommand['transformReply']): void;
    addFunction(name: string, fn: RedisFunction, args: Array<unknown>): RedisCommandArguments;
    addScript(script: RedisScript, args: Array<unknown>): RedisCommandArguments;
    handleExecReplies(rawReplies: Array<RedisCommandRawReply>): Array<RedisCommandRawReply>;
    transformReplies(rawReplies: Array<RedisCommandRawReply>): Array<RedisCommandRawReply>;
}
