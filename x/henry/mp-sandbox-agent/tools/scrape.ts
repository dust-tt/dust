import { z } from "zod";
import { defineTool } from "./helpers";
import { encoding_for_model } from "tiktoken";

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

      // Use OpenAI's tokenizer (cl100k_base is used by GPT-4 and newer models)
      const tokenizer = encoding_for_model("gpt-4");
      
      // Function to count tokens using tiktoken
      function countTokens(text: string): number {
        try {
          const tokens = tokenizer.encode(text);
          return tokens.length;
        } catch (error) {
          console.error("Error counting tokens:", error);
          // Fallback to a simple approximation if tiktoken fails
          return Math.ceil(text.length / 4);
        }
      }

      // Function to truncate text to token limit using tiktoken
      function truncateToTokenLimit(text: string, tokenLimit: number): string {
        try {
          const tokens = tokenizer.encode(text);
          
          if (tokens.length <= tokenLimit) {
            return text;
          }
          
          // For safety, use a character-based approach for truncation
          // Calculate roughly how many characters to include to stay under token limit
          const charLimit = Math.floor((tokenLimit / tokens.length) * text.length);
          
          // Truncate text directly (more reliable than using tiktoken's decode)
          const truncatedText = text.substring(0, charLimit);
          
          return truncatedText + "\n... [content truncated, full content available in result]";
        } catch (error) {
          console.error("Error truncating text:", error);
          // Fallback to a simple approximation if tiktoken fails
          return text.substring(0, tokenLimit * 4) + "\n... [content truncated, full content available in result]";
        }
      }

      // Log a human-friendly summary
      console.log(
        "Scrape results:",
        input.urls
          .map((url, i) =>
            results[i].success
              ? `${url}: Scraped successfully (${results[i].data.markdown.length} chars, ~${countTokens(results[i].data.markdown)} tokens)`
              : `${url}: Failed to scrape`
          )
          .join("\n")
      );
      
      // Log content for the agent with proper token limiting
      const TOKEN_LIMIT = 2000;
      log(
        input.urls
          .map((url, i) =>
            results[i].success
              ? `Content from ${url}:\n${truncateToTokenLimit(results[i].data.markdown, TOKEN_LIMIT)}`
              : `${url}: Failed to scrape`
          )
          .join("\n\n---\n\n")
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
