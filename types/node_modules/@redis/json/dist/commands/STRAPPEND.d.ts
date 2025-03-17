export declare const FIRST_KEY_INDEX = 1;
declare type AppendArguments = [key: string, append: string];
declare type AppendWithPathArguments = [key: string, path: string, append: string];
export declare function transformArguments(...[key, pathOrAppend, append]: AppendArguments | AppendWithPathArguments): Array<string>;
export declare function transformReply(): number | Array<number>;
export {};
