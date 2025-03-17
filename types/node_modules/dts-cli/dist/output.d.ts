export declare const info: (msg: string) => void;
export declare const error: (msg: string | Error) => void;
export declare const success: (msg: string) => void;
export declare const wait: (msg: string) => () => void;
export declare const cmd: (cmd: string) => string;
export declare const code: (cmd: string) => string;
export declare const param: (param: string) => string;
