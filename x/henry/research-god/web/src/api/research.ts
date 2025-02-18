import { ResearchService } from "../../../src/services/research";
import {
  ResearchResponse,
  ProgressEvent,
  Topic,
} from "../../../src/types/research";

export interface ResearchRequest {
  query: string;
  depth?: number;
  saveLogs?: boolean;
}

export interface ResearchOptions {
  onProgress?: (event: ProgressEvent) => void;
}

export async function handleResearch(
  request: ResearchRequest,
  options?: ResearchOptions
): Promise<ResearchResponse> {
  try {
    // Validate request
    if (!request.query || request.query.trim().length === 0) {
      throw new Error("Query is required");
    }

    if (
      request.depth !== undefined &&
      (request.depth < 1 || request.depth > 5)
    ) {
      throw new Error("Depth must be between 1 and 5");
    }

    console.log("Starting research request:", {
      query: request.query,
      depth: request.depth,
      saveLogs: request.saveLogs,
      timestamp: new Date().toISOString(),
    });

    const researchService = new ResearchService({
      onTopicExploration: (topic: Topic) => {
        options?.onProgress?.({
          type: "topic",
          data: {
            topic: {
              id: topic.id,
              title: topic.title,
              description: topic.description,
              searchQueries: topic.searchQueries,
            },
          },
        });
      },
      onProgress: (event: ProgressEvent) => {
        // Forward all progress events, including token_update events
        options?.onProgress?.(event);
      },
    });

    const results = await researchService.research(request.query, {
      maxDepth: request.depth || 3,
    });

    if (!results || results.length === 0) {
      throw new Error(
        `No research results found for query "${request.query}". This might indicate an issue with the research process.`
      );
    }

    const response: ResearchResponse = {
      results,
    };

    if (request.saveLogs) {
      const logs = researchService.getLogs();
      response.logs = logs;

      console.log("Research completed successfully:", {
        query: request.query,
        resultsCount: results.length,
        logsCount: logs.length,
        timestamp: new Date().toISOString(),
      });
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorContext = {
      request,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };

    console.error("Research request failed:", errorContext);

    // Notify about the error through the progress callback
    options?.onProgress?.({
      type: "error",
      error: errorMessage,
    });

    // Throw a more informative error
    throw new Error(
      `Research request failed: ${errorMessage}\n\nRequest context: ${JSON.stringify(
        errorContext,
        null,
        2
      )}`
    );
  }
}
