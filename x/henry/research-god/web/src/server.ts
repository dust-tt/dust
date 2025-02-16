import { config } from "dotenv";
import type {
  ProgressEvent,
  ExplorationResult,
  TokenUsage,
} from "../../src/types/research";
import { AIService } from "../../src/services/ai";
import { ResearchService } from "../../src/services/research";

// Load environment variables
config();

// Verify required environment variables
const requiredEnvVars = [
  "FIRECRAWL_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SERPAPI_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

// Define interfaces for session management
interface ResearchSession {
  id: string;
  controller: ReadableStreamController<Uint8Array> | null;
  tokenUsage: TokenUsage;
  query?: string;
  clarifyingQuestions?: string[];
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

const activeStreams = new Map<string, ResearchSession>();

const server = Bun.serve({
  port: 3050,
  // Set idle timeout to 4 minutes (240 seconds), which is within Bun's limit of 255 seconds
  idleTimeout: 240,
  development: process.env.NODE_ENV !== "production",
  async fetch(req) {
    try {
      // Enable CORS
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      const url = new URL(req.url);
      console.log(`Received ${req.method} request to ${url.pathname}`);

      // Handle clarification endpoint
      if (req.method === "POST" && url.pathname === "/api/research/clarify") {
        const { sessionId, answers } = await req.json();
        console.log(
          `[Clarify] Processing answers for session ${sessionId}:`,
          answers
        );

        const session = activeStreams.get(sessionId);
        if (!session || !session.controller || !session.query) {
          return new Response("Session not found or invalid", { status: 404 });
        }

        // Send unified spec event first with actual answers
        const unifiedSpecEvent: ProgressEvent = {
          type: "unified_spec",
          data: {
            unifiedSpec: {
              query: session.query,
              clarifications: answers,
              unifiedIntent: `Research about ${
                session.query
              } with specific focus based on user clarifications: ${Object.entries(
                answers
              )
                .map(([q, a]) => `\n- ${q}: ${a}`)
                .join("")}`,
            },
            tokenUsage: session.tokenUsage,
          },
        };
        const specMessage = `data: ${JSON.stringify(unifiedSpecEvent)}\n\n`;
        session.controller.enqueue(new TextEncoder().encode(specMessage));

        try {
          console.log(`[Clarify] Starting research for session ${sessionId}`);
          const researchService = new ResearchService({
            onProgress: (event) => {
              if (session.controller) {
                // Preserve cumulative token usage
                if (event.data?.tokenUsage) {
                  event.data.tokenUsage = {
                    promptTokens:
                      session.tokenUsage.promptTokens +
                      event.data.tokenUsage.promptTokens,
                    completionTokens:
                      session.tokenUsage.completionTokens +
                      event.data.tokenUsage.completionTokens,
                    totalTokens:
                      session.tokenUsage.totalTokens +
                      event.data.tokenUsage.totalTokens,
                  };
                }
                const message = `data: ${JSON.stringify(event)}\n\n`;
                session.controller.enqueue(new TextEncoder().encode(message));
              }
            },
          });

          const result = await researchService.research(
            session.query as string,
            {
              answers,
              maxDepth: 3,
            }
          );

          console.log(
            `[Clarify] Got research results for session ${sessionId}`
          );

          if (session.controller) {
            // Send the results through the SSE stream
            const completeEvent: ProgressEvent = {
              type: "complete",
              data: {
                results: result,
                logs: researchService.getLogs(),
                tokenUsage: session.tokenUsage, // Include final token usage
              },
            };
            const completeMessage = `data: ${JSON.stringify(
              completeEvent
            )}\n\n`;
            session.controller.enqueue(
              new TextEncoder().encode(completeMessage)
            );
            console.log(
              `[Clarify] Research completed for session ${sessionId}`
            );
          }

          // Return success after research is complete
          return new Response(JSON.stringify({ success: true }), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (error) {
          console.error(
            `[Clarify] Research failed for session ${sessionId}:`,
            error
          );

          // Send error event to client
          if (session.controller) {
            const errorEvent: ProgressEvent = {
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Research operation failed",
              data: { tokenUsage: session.tokenUsage },
            };
            const errorMessage = `data: ${JSON.stringify(errorEvent)}\n\n`;
            session.controller.enqueue(new TextEncoder().encode(errorMessage));
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Research operation failed",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }
      }

      // Handle research endpoint
      if (req.method === "POST" && url.pathname === "/api/research") {
        try {
          const body = await req.json();
          const sessionId = crypto.randomUUID();
          console.log(
            `[Research] Starting research for session ${sessionId}`,
            body
          );
          const aiService = new AIService();
          // Get clarifying questions first
          const { questions, tokenUsage } =
            await aiService.generateClarifyingQuestions(body.query);

          // Store the session with the query and questions
          activeStreams.set(sessionId, {
            id: sessionId,
            controller: null,
            tokenUsage,
            query: body.query,
            clarifyingQuestions: questions,
          });

          // Return just the sessionId
          return Response.json(
            { sessionId },
            {
              headers: {
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        } catch (error) {
          console.error("[API] Error:", error);
          return Response.json(
            {
              error:
                error instanceof Error ? error.message : "An error occurred",
            },
            {
              status: 500,
              headers: {
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }
      }

      // Handle SSE connection for research progress
      if (req.method === "GET" && url.pathname === "/api/research/progress") {
        const sessionId = url.searchParams.get("sessionId");
        console.log(
          "[Progress] Stream request received for session:",
          sessionId
        );

        if (!sessionId) {
          console.error("[Progress] Invalid sessionId:", sessionId);
          return new Response("Session ID is required", { status: 400 });
        }

        // Create a stream with error handling
        const stream = new ReadableStream({
          start(controller) {
            console.log(`[Progress] Stream started for session ${sessionId}`);

            // Get the session
            const session = activeStreams.get(sessionId);
            if (!session) {
              throw new Error("Session not found");
            }

            // Update the controller
            session.controller = controller;

            // Send initial connected message with token usage from clarifying questions
            const connectedEvent: ProgressEvent = {
              type: "connected",
              data: {
                topic: {
                  id: crypto.randomUUID(),
                  title: "Research Started",
                  description: "Establishing connection...",
                  searchQueries: [],
                },
                tokenUsage: session.tokenUsage, // Include token usage from clarifying questions
              },
            };

            const message = `data: ${JSON.stringify(connectedEvent)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));

            // Send clarifying questions if they exist
            if (session.clarifyingQuestions?.length) {
              const questionsEvent: ProgressEvent = {
                type: "clarifying_questions",
                data: {
                  questions: session.clarifyingQuestions,
                  tokenUsage: session.tokenUsage, // Include token usage with questions
                },
              };
              const questionsMessage = `data: ${JSON.stringify(
                questionsEvent
              )}\n\n`;
              controller.enqueue(new TextEncoder().encode(questionsMessage));
            }
          },
          cancel() {
            console.log(`[Progress] Stream cancelled for session ${sessionId}`);
            activeStreams.delete(sessionId);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("[Server] Error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`Server running at http://localhost:${server.port}`);
