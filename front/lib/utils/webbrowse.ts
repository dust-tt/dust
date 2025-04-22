import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";

const credentials = dustManagedCredentials();

const BROWSERLESS_BASE_URL =
  "https://production-sfo.browserless.io/chromium/bql";

export type BrowseScrapeResponse = {
  data: Record<string, any>;
  response: {
    status: string | null;
    url: string | null;
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
    `${BROWSERLESS_BASE_URL}?token=${credentials.BROWSERLESS_API_KEY}&proxy=residential&proxyCountry=us`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        query: `
mutation ScrapeWebsite {
  goto(url: "${url}", waitUntil: firstMeaningfulPaint) {
    status
    time
  }
  body: html(selector: "body") {
    html
  }
}
`,
      }),
    }
  );

  if (!res.ok) {
    return new Err(new Error("Bad request scraping url"));
  }

  const json = await res.json();

  return new Ok({
    data: json.data.body.html as Record<string, any>,
    response: {
      status: json.data.goto.status ?? null,
      url: json.data.goto.url ?? null,
    },
  });
};
