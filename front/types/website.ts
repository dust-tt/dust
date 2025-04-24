import type {
  CrawlingFrequency,
  DepthOption,
  WebCrawlerConfigurationType,
  WebcrawlerCustomCrawler,
} from "./connectors/webcrawler";

export type WebsiteFormState = {
  url: string;
  name: string;
  maxPages: number | null;
  depth: DepthOption;
  crawlMode: "child" | "website";
  crawlFrequency: CrawlingFrequency;
  headers: { key: string; value: string }[];
  customCrawler: WebcrawlerCustomCrawler | null;
  errors?: {
    url?: string;
    name?: string;
  };
};

export type WebsiteFormAction =
  | {
      [K in keyof Omit<WebsiteFormState, "errors">]: {
        type: "SET_FIELD";
        field: K;
        value: WebsiteFormState[K];
      };
    }[keyof Omit<WebsiteFormState, "errors">]
  | {
      type: "SET_ERROR";
      field: keyof WebsiteFormState["errors"];
      value: string | undefined;
    }
  | {
      type: "RESET";
      config?: WebCrawlerConfigurationType | null;
      name?: string;
    }
  | { type: "VALIDATE" };

export const FREQUENCY_DISPLAY_TEXT: Record<CrawlingFrequency, string> = {
  never: "Never",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

export const DEPTH_DISPLAY_TEXT: Record<DepthOption, string> = {
  0: "0 level",
  1: "1 level",
  2: "2 levels",
  3: "3 levels",
  4: "4 levels",
  5: "5 levels",
};
