import { CrawlingFrequency, DepthOption, WebCrawlerConfigurationType } from "../connectors/webcrawler";
export type WebsiteFormState = {
    url: string;
    name: string;
    maxPages: number | null;
    depth: DepthOption;
    crawlMode: "child" | "website";
    crawlFrequency: CrawlingFrequency;
    headers: {
        key: string;
        value: string;
    }[];
    errors?: {
        url?: string;
        name?: string;
    };
};
export type WebsiteFormAction = {
    [K in keyof Omit<WebsiteFormState, "errors">]: {
        type: "SET_FIELD";
        field: K;
        value: WebsiteFormState[K];
    };
}[keyof Omit<WebsiteFormState, "errors">] | {
    type: "SET_ERROR";
    field: keyof WebsiteFormState["errors"];
    value: string | undefined;
} | {
    type: "RESET";
    config?: WebCrawlerConfigurationType | null;
    name?: string;
} | {
    type: "VALIDATE";
};
export declare const FREQUENCY_DISPLAY_TEXT: Record<CrawlingFrequency, string>;
export declare const DEPTH_DISPLAY_TEXT: Record<DepthOption, string>;
//# sourceMappingURL=website.d.ts.map