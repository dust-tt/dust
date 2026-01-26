import type { RspackOptionsNormalized } from './normalization';
export declare const applyRspackOptionsDefaults: (options: RspackOptionsNormalized) => {
    platform: false | {
        web: boolean | null | undefined;
        browser: boolean | null | undefined;
        webworker: boolean | null | undefined;
        node: boolean | null | undefined;
        nwjs: boolean | null | undefined;
        electron: boolean | null | undefined;
    };
};
export declare const applyRspackOptionsBaseDefaults: (options: RspackOptionsNormalized) => void;
export declare const getPnpDefault: () => boolean;
