import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type { OAuthProvider } from "@app/types";

import type { MCPServerDefinitionType } from "../mcp_metadata";
import { runAction } from "../server";

const htmlPage = `
<div style="font-family: Arial, sans-serif;">
    <div style="padding: 20px;">
        <div style="margin-bottom: 20px;">
            <span style="color: #4285f4; font-size: 24px;">G</span>
            <span style="color: #ea4335; font-size: 24px;">o</span>
            <span style="color: #fbbc05; font-size: 24px;">o</span>
            <span style="color: #4285f4; font-size: 24px;">g</span>
            <span style="color: #34a853; font-size: 24px;">l</span>
            <span style="color: #ea4335; font-size: 24px;">e</span>
        </div>
        
        <div style="border: 1px solid #dfe1e5; border-radius: 24px; padding: 8px 16px; width: 600px;">
            <span>reddit</span>
            <span style="float: right;">🔍</span>
        </div>
        
        <div style="margin-top: 20px;">
            <p style="color: #666;">About 4,170,000,000 results (0.45 seconds)</p>
            
            <div style="margin: 20px 0;">
                <a href="https://reddit.com" style="color: #1a0dab; text-decoration: none; font-size: 20px;">Reddit - Dive into anything</a>
                <p style="color: #006621; font-size: 14px;">https://www.reddit.com</p>
                <p style="color: #333; font-size: 14px;">Reddit is a network of communities where people can dive into their interests, hobbies and passions. There's a community for whatever you're interested in.</p>
            </div>
            
            <div style="margin: 20px 0;">
                <a href="https://wikipedia.com/reddit" style="color: #1a0dab; text-decoration: none; font-size: 20px;">Reddit - Wikipedia</a>
                <p style="color: #006621; font-size: 14px;">https://en.wikipedia.org › wiki › Reddit</p>
                <p style="color: #333; font-size: 14px;">Reddit is an American social news aggregation, content rating, and discussion website. Registered users submit content to the site such as links, text posts, ...</p>
            </div>
            
            <div style="margin: 20px 0;">
                <a href="https://reddit.com/r/populat" style="color: #1a0dab; text-decoration: none; font-size: 20px;">r/popular - Reddit</a>
                <p style="color: #006621; font-size: 14px;">https://www.reddit.com/r/popular</p>
                <p style="color: #333; font-size: 14px;">Reddit's largest communities. Trending posts and discussions from across the site.</p>
            </div>
        </div>
    </div>
</div>
     `;

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
  icon: "command",
  authorization: {
    provider,
    use_case: "connection" as const,
  },
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "websearch",
    "A google search tool",
    {
      query: z.string().describe("The google query that will be send."),
    },
    async ({ query }) => {
      logger.debug({ query }, "[webtools/websearch]");
      const config = cloneBaseConfig(
        getDustProdAction("assistant-v2-websearch").config
      );

      const websearchRes = await runAction(
        auth,
        "assistant-v2-websearch",
        config,
        [{ query }]
      );

      if (websearchRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: websearchRes.error.message,
            },
          ],
        };
      }

      const { results } = websearchRes.value;

      logger.debug({ results }, "RESULTS");

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: htmlPage,
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
      logger.debug({ query, url }, "[webtools/webbrowser]");
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
