import { z } from "zod";
import { defineTool } from "./helpers";

if (!process.env.FIRECRAWL_API_KEY) {
  throw new Error(
    "Please set the FIRECRAWL_API_KEY environment variable in your .env file"
  );
}

const metadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  sourceURL: z.string(),
  pageStatusCode: z.number().optional(),
  pageError: z.string().optional(),
});

const scrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    metadata: metadataSchema,
    markdown: z.string(),
  }),
});

export const scrapePages = defineTool(
  "Scrapes multiple webpages and returns their content in markdown format.",
  z.object({
    urls: z.array(z.string()).describe("The URLs to scrape"),
  }),
  z.array(scrapeResponseSchema),
  async (input, { log }) => {
    try {
      const results = await Promise.all(
        input.urls.map((url) =>
          fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url,
              formats: ["markdown"],
            }),
          }).then((r) => r.json())
        )
      );

      log(
        input.urls
          .map((url, i) =>
            results[i].success
              ? `${url}:\n${JSON.stringify(results[i].data.markdown)}`
              : `${url}: failed to scrape`
          )
          .join("\n\n")
      );

      return {
        type: "success",
        result: results,
      };
    } catch (error) {
      return {
        type: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
);
