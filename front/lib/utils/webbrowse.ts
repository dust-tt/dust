import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";

const credentials = dustManagedCredentials();

const BROWSERLESS_BASE_URL = "https://chrome.browserless.io";

export type BrowseScrapeResponse = {
  data: Record<string, any>;
  response: {
    code: string | null;
    status: string | null;
    url: string | null;
    ip: string | null;
    port: string | null;
  };
};

export const browseUrl = async (
  url: string
): Promise<Result<BrowseScrapeResponse, Error>> => {
  if (credentials.BROWSERLESS_API_KEY == null) {
    return new Err(
      new Error(
        "util/webbrowse: a DUST_MANAGED_BROWSERLESS_API_KEY is required"
      )
    );
  }

  const res = await fetch(
    `${BROWSERLESS_BASE_URL}/scrape?token=${credentials.BROWSERLESS_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        url,
        gotoOptions: {
          timeout: 5000,
        },
        elements: [
          {
            selector: "body",
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    return new Err(new Error("Bad request scraping url"));
  }

  const json = await res.json();

  return new Ok({
    data: json.data as Record<string, any>,
    response: {
      code: res.headers.get("x-response-code"),
      status: res.headers.get("x-response-status"),
      url: res.headers.get("x-response-url"),
      ip: res.headers.get("x-response-ip"),
      port: res.headers.get("x-response-port"),
    },
  });
};
