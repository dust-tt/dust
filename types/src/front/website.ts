import {
  CrawlingFrequency,
  DepthOption,
  WebCrawlerConfigurationType,
} from "../connectors/webcrawler";

export type WebsiteFormState = {
  url: string;
  name: string;
  maxPages: number | null;
  depth: DepthOption;
  crawlMode: "child" | "website";
  crawlFrequency: CrawlingFrequency;
  headers: { key: string; value: string }[];
  errors?: {
    url?: string;
    name?: string;
  };
};

export type WebsiteFormAction =
  | {
      type: "SET_FIELD";
      field: keyof Omit<WebsiteFormState, "errors">;
      value: any;
    }
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
