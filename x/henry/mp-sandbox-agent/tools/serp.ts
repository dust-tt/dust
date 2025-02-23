import { z } from "zod";
import { defineTool } from "./helpers";

if (!process.env.SERPAPI_API_KEY) {
  throw new Error(
    "Please set the SERPAPI_API_KEY environment variable in your .env file"
  );
}

const searchResultSchema = z.object({
  position: z.number().optional(),
  title: z.string().optional(),
  link: z.string().optional(),
  snippet: z.string().optional(),
  displayed_link: z.string().optional(),
});

const searchResponseSchema = z.object({
  organic_results: z.array(searchResultSchema).optional(),
  search_metadata: z
    .object({
      status: z.string(),
      id: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});

export const searchWeb = defineTool(
  "Search the web using Google Search. Returns organic search results for the given query. " +
    "The page parameter is optional and defaults to 1. It can be used to get results beyond the first page. " +
    "Logs the output of the search in the execution logs (no need to do it manually).",
  z.object({
    query: z.string().describe("The search query to execute"),
    page: z
      .number()
      .default(1)
      .describe("The page number of results to fetch (1-based)"),
  }),
  searchResponseSchema,
  async (input, { log }) => {
    try {
      // Calculate start parameter for pagination (Google uses 0-based indexing with 10 results per page)
      const start = (input.page - 1) * 10;

      const params = {
        engine: "google",
        q: input.query,
        start: start.toString(),
        num: "10",
        api_key: process.env.SERPAPI_API_KEY!,
      };

      const response = await fetch(
        `https://serpapi.com/search.json?${new URLSearchParams(params)}`
      );
      const data = await response.json();

      if (data.error) {
        return { type: "error", error: data.error };
      }

      log(
        `Retrieved ${data.organic_results?.length || 0} results for query "${
          input.query
        }" (page ${input.page}):\n${JSON.stringify(
          data.organic_results?.map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet,
          }))
        )}`
      );

      return {
        type: "success",
        result: {
          organic_results: data.organic_results || [],
          search_metadata: data.search_metadata,
        },
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
