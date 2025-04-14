import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { MCPServerDefinitionType } from "@app/lib/api/mcp";
import { webSearch } from "@app/lib/utils/webtools";
import logger from "@app/logger/logger";
import type { OAuthProvider } from "@app/types";

const webLogger = logger.child(
  {},
  { msgPrefix: "[webtools] ", module: "mcp/webtools" }
);

const redditHtml = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #DAE0E6; padding: 20px;">
    <div style="max-width: 800px; margin: 0 auto; background-color: white; border-radius: 4px;">
        <!-- Header -->
        <div style="padding: 8px 16px; border-bottom: 1px solid #ccc; background-color: white;">
            <span style="color: #FF4500; font-weight: bold; font-size: 24px;">reddit</span>
            <span style="color: #666; margin-left: 20px;">Popular posts</span>
        </div>

        <!-- Posts -->
        <div style="padding: 10px;">
            <!-- Post 1 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">1</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/tech_enthusiast • 5 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">Scientists discover new species of deep-sea creatures in the Pacific Ocean</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/science • 15.2k upvotes • 342 comments</div>
                </div>
            </div>

            <!-- Post 2 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">2</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/gaming_master • 2 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">This hidden Easter egg in RDR2 took me 3 years to find!</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/gaming • 24.7k upvotes • 891 comments</div>
                </div>
            </div>

            <!-- Post 3 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">3</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/foodie_dreams • 8 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">I made my grandmother's secret pasta recipe and it turned out perfect!</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/cooking • 8.9k upvotes • 156 comments</div>
                </div>
            </div>

            <!-- Post 4 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">4</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/movie_buff • 3 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">First look at the upcoming Dune: Part Two behind the scenes footage</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/movies • 32.1k upvotes • 1.2k comments</div>
                </div>
            </div>

            <!-- Post 5 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">5</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/cat_lover • 6 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">My cat waited 6 hours for me to finish work just like this</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/aww • 45.3k upvotes • 523 comments</div>
                </div>
            </div>

            <!-- Post 6 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">6</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/history_nerd • 4 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">TIL: Ancient Romans used to paint their statues in bright colors</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/todayilearned • 12.8k upvotes • 445 comments</div>
                </div>
            </div>

            <!-- Post 7 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">7</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/fitness_guru • 7 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">After 2 years of consistent training, I finally achieved my fitness goals!</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/fitness • 19.5k upvotes • 678 comments</div>
                </div>
            </div>

            <!-- Post 8 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">8</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/space_explorer • 9 hours ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">NASA's Webb telescope captures stunning new image of distant galaxy</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/space • 28.3k upvotes • 892 comments</div>
                </div>
            </div>

            <!-- Post 9 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">9</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/book_worm • 1 hour ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">What book completely changed your perspective on life?</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/books • 9.7k upvotes • 1.5k comments</div>
                </div>
            </div>

            <!-- Post 10 -->
            <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex;">
                <div style="margin-right: 12px; color: #666;">10</div>
                <div>
                    <div style="color: #666; font-size: 12px;">Posted by u/meme_master • 30 minutes ago</div>
                    <div style="font-size: 16px; margin: 4px 0;">
                        <a href="#" style="color: #1a1a1b; text-decoration: none;">This is what happens when you let AI generate memes</a>
                    </div>
                    <div style="color: #666; font-size: 12px;">r/memes • 56.2k upvotes • 2.3k comments</div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

export const provider: OAuthProvider = "google_drive" as const;
export const serverInfo: MCPServerDefinitionType = {
  name: "webtools",
  version: "1.0.0",
  description:
    "You are a helpful server that search google and browser the web for the user.",
  visual: "command",
  authorization: {
    provider,
    use_case: "connection" as const,
  },
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "websearch",
    "A google search tool",
    {
      query: z.string().describe("The google query that will be send."),
    },
    async ({ query }) => {
      webLogger.debug({ query }, "[websearch]");

      const websearchRes = await webSearch({ provider: "serpapi", query });

      if (websearchRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to search: ${websearchRes.error.message}`,
            },
          ],
        };
      }

      const results = websearchRes.value;

      webLogger.debug({ results }, "[websearch]: RESULTS");

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(results),
          },
        ],
      };
    }
  );

  server.tool(
    "webbrowser",
    "A tool to browser website",
    {
      query: z.string(),
      url: z.string(),
    },
    async ({ query, url }) => {
      webLogger.debug({ query, url }, "[webbrowser]");
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: redditHtml,
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
