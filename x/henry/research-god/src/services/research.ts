import { AIService, ResearchAction } from "./ai";
import { SearchResult, SerpService } from "./serp";
import { FirecrawlService, ScrapedContent } from "./firecrawl";
import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_MODEL } from "../config";
import {
  Topic,
  TokenUsage,
  ProgressEvent,
  ProgressEventType,
  ProgressEventData,
  ResearchServiceOptions,
  ResearchOptions,
  ExplorationResult,
  ContentExtract,
  Scratchpad,
  ResearchSpec,
} from "../types/research";

// Generate a short random ID (8 characters)
function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export class ResearchService {
  private aiService: AIService;
  private serpService: SerpService;
  private firecrawlService: FirecrawlService;
  private logs: string[] = [];
  private options: ResearchServiceOptions;
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(options: ResearchServiceOptions = {}) {
    this.options = options;
    this.aiService = options.aiService || new AIService();
    this.serpService = options.serpService || new SerpService();
    this.firecrawlService = options.firecrawlService || new FirecrawlService();
  }

  public async research(
    query: string,
    options: ResearchOptions = {}
  ): Promise<ExplorationResult[]> {
    this.log("Starting research process", {
      query,
      options,
      model: OPENAI_MODEL,
      apiKeyPresent: !!OPENAI_API_KEY,
    });

    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }

    // Use provided answers or wait for them
    const answers = options.answers || {};

    // Step 2: Create unified spec
    this.log("Step 2: Creating unified specification");
    const spec = await this.createUnifiedSpec(query, answers);

    // Emit token usage after creating spec
    this.emitProgress({
      type: "token_update",
      data: {
        tokenUsage: { ...this.tokenUsage },
      },
    });

    // Emit the unified spec
    this.emitProgress({
      type: "unified_spec",
      data: {
        unifiedSpec: spec,
      },
    });

    // Step 3: Explore topics
    this.log("Step 3: Starting exploration of topics");
    const results = await this.exploreTopics(spec, options);

    this.log("Research process completed", {
      query,
      topLevelTopics: results.length,
      resultsCount: results.length,
    });

    // Generate report sections
    this.emitAgentStatus("Generating report structure...");
    const { sections, tokenUsage } =
      await this.aiService.generateReportSections(spec.unifiedIntent, results);
    this.updateTokenUsage(tokenUsage);

    // Write each section
    this.emitAgentStatus("Writing report sections...");
    const writtenSections: Record<string, string> = {};

    for (const section of sections) {
      this.log(`Writing section: ${section.title}`);
      this.emitAgentStatus(`Writing report section: ${section.title}...`);

      const { content, tokenUsage } =
        await this.aiService.generateReportSectionContent(
          section,
          sections,
          writtenSections,
          results
        );

      this.updateTokenUsage(tokenUsage);

      writtenSections[section.title] = content.content;

      // Emit progress event for the written section
      this.emitProgress({
        type: "report_section",
        data: {
          section: {
            title: section.title,
            content: content.content,
            citations: content.citations,
          },
        },
      });

      console.log("\n\n\n", content, "\n\n\n");
    }

    // Emit final report
    this.emitProgress({
      type: "report_complete",
      data: {
        sections: Object.entries(writtenSections).map(([title, content]) => ({
          title,
          content,
        })),
      },
    });

    const reportAsMarkdown = sections
      .map((section) => {
        const content = writtenSections[section.title];
        return `# ${section.title}\n\n${content}\n\n`;
      })
      .join("\n\n");

    console.log("\n\n\n", reportAsMarkdown, "\n\n\n");

    return results;
  }

  private async extractInitialTopics(spec: ResearchSpec): Promise<Topic[]> {
    this.emitAgentStatus(
      "Creating initial list of main research topics to explore..."
    );
    this.log("Extracting initial topics from spec:", {
      unifiedIntent: spec.unifiedIntent,
    });

    // Get initial topics using the new createResearchPlan method
    const { plan, tokenUsage } = await this.aiService.createResearchPlan(
      spec.unifiedIntent
    );
    this.updateTokenUsage(tokenUsage);

    if (
      !plan.subTopics ||
      plan.subTopics.length < 2 ||
      plan.subTopics.length > 5
    ) {
      throw new Error(
        `Invalid number of topics generated. Expected 2-5 topics, got ${
          plan.subTopics?.length || 0
        }`
      );
    }

    const topics: Topic[] = plan.subTopics.map((st) => ({
      id: generateShortId(),
      title: st.title,
      description: st.description,
      searchQueries: [],
    }));

    // Generate search queries for each topic sequentially
    for (const topic of topics) {
      this.emitAgentStatus(
        `Generating search queries for topic: ${topic.title}...`
      );
      this.log(`Generating search queries for topic: ${topic.title}`);
      const { queryPlan, tokenUsage: queryTokenUsage } =
        await this.aiService.generateSearchQueriesForTopic(spec.unifiedIntent, {
          title: topic.title,
          description: topic.description,
          importance: "primary topic",
          confidenceScore: 1.0,
        });
      this.updateTokenUsage(queryTokenUsage);
      topic.searchQueries = queryPlan.queries;

      // Log the generated queries
      this.log(`Generated queries for topic "${topic.title}":`, {
        queries: queryPlan.queries,
      });

      // Emit progress to show we're working on it
      this.emitProgress({
        type: "topic",
        data: {
          topic: {
            id: topic.id,
            title: topic.title,
            description: topic.description,
            searchQueries: topic.searchQueries,
            status: "pending",
          },
        },
      });

      // Add a small delay between API calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.log("Extracted initial topics:", {
      topicCount: topics.length,
      topics: topics.map((t) => ({
        title: t.title,
        queryCount: t.searchQueries.length,
      })),
    });
    return topics;
  }

  private updateTokenUsage(usage: TokenUsage) {
    // Update the total token usage
    this.tokenUsage = {
      promptTokens: this.tokenUsage.promptTokens + usage.promptTokens,
      completionTokens:
        this.tokenUsage.completionTokens + usage.completionTokens,
      totalTokens: this.tokenUsage.totalTokens + usage.totalTokens,
    };

    // Always emit a token_update event after updating token usage
    this.emitProgress({
      type: "token_update",
      data: {
        tokenUsage: { ...this.tokenUsage },
      },
    });

    return { ...this.tokenUsage };
  }

  private emitProgress(event: ProgressEvent) {
    if (this.options.onProgress) {
      // Always include current token usage in the event data
      if (!event.data) {
        event.data = {};
      }
      event.data.tokenUsage = { ...this.tokenUsage };

      this.log("Emitting progress event:", {
        type: event.type,
        tokenUsage: this.tokenUsage,
      });

      this.options.onProgress(event);
    }
  }

  private log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
    this.logs.push(logMessage);
  }

  private emitAgentStatus(status: string) {
    this.emitProgress({
      type: "agent_status",
      data: {
        agentStatus: status,
        tokenUsage: { ...this.tokenUsage },
      },
    });
  }

  private async createUnifiedSpec(
    query: string,
    answers: Record<string, string>
  ): Promise<ResearchSpec> {
    this.emitAgentStatus(
      "Creating a unified research specification from your query and answers..."
    );
    this.log("Creating unified research specification", { query, answers });

    const spec = {
      query,
      clarifications: answers,
      unifiedIntent: `Query: ${query}\n\nClarifying Information:\n${Object.entries(
        answers
      )
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join("\n\n")}`,
    };

    // Emit the unified specification
    this.emitProgress({
      type: "unified_spec",
      data: {
        unifiedSpec: spec,
      },
    });

    this.log("Created unified specification:", { spec });
    return spec;
  }

  private createScratchpad(topicId: string): Scratchpad {
    return {
      topicId,
      searchResults: [],
      contentExtracts: [],
      browsedUrls: new Set<string>(),
    };
  }

  private async exploreTopic(
    topic: Topic,
    exploredTopics: Set<string>,
    initialTopics: Topic[]
  ): Promise<ExplorationResult> {
    this.log(`Starting exploration of topic: ${topic.title}`, {
      topicId: topic.id,
      currentExploredTopics: Array.from(exploredTopics),
      currentTokenUsage: this.tokenUsage,
    });

    // Only create a new scratchpad for top-level topics
    const scratchpad = this.createScratchpad(topic.id);

    // Track total tokens for this topic
    let topicTokenCount = 0;

    // Emit initial topic event with current token usage
    this.emitProgress({
      type: "topic",
      data: {
        topic: {
          ...topic,
          status: "exploring",
          tokenCount: topicTokenCount,
        },
        tokenUsage: { ...this.tokenUsage },
      },
    });

    // Initialize the research pool with the search queries
    let researchPool: ResearchAction[] = topic.searchQueries.map((q) => ({
      id: generateShortId(),
      type: "search_query",
      query: q.query,
      reason: q.explanation,
    }));

    while (researchPool.length > 0) {
      // Randomize the order of the research pool
      // researchPool.sort(() => Math.random() - 0.5);

      // Ask the AI to pick the next action from the research pool
      this.emitAgentStatus("Picking next action from research pool...");
      const { selectedActionId, explanation, tokenUsage } =
        await this.aiService.pickNextAction(
          researchPool,
          scratchpad,
          initialTopics.filter((t) => t.id !== topic.id)
        );
      this.updateTokenUsage(tokenUsage);

      let selectedAction = researchPool.find(
        (action) => action.id === selectedActionId
      );

      if (!selectedAction) {
        console.error("Selected action not found in research pool", {
          selectedActionId,
          explanation,
          researchPool,
        });
        this.emitAgentStatus(
          "Selected action was not found in research pool. picking the last action..."
        );
        selectedAction = researchPool[researchPool.length - 1];
      }

      // Initialize scratchpad.researchActions if it doesn't exist
      if (!scratchpad.researchActions) {
        scratchpad.researchActions = [];
      }

      // Add action to scratchpad and emit event
      const timestamp = new Date().toISOString();

      scratchpad.researchActions.push({
        action: selectedAction,
        topicId: topic.id,
        timestamp,
        reason: explanation,
      });

      // Emit the research action event
      this.emitProgress({
        type: "research_action",
        data: {
          researchAction: {
            action: selectedAction,
            topicId: topic.id,
            timestamp,
            reason: explanation,
          },
        },
      });

      researchPool = researchPool.filter(
        (action) => action.id !== selectedActionId
      );

      let agentStatus = `Executing action: ${selectedAction?.type}`;
      if (selectedAction?.type === "search_query") {
        agentStatus += ` with query: ${selectedAction.query}`;
      } else if (selectedAction?.type === "search_result") {
        agentStatus += ` with URL: ${selectedAction.url}`;
      }
      this.emitAgentStatus(agentStatus);

      const newActions = await this.executeAction(
        selectedAction,
        topic,
        scratchpad
      );
      this.emitAgentStatus(`Found ${newActions.length} new actions`);
      researchPool.push(...newActions);

      // Update total tokens for this topic
      topicTokenCount = scratchpad.contentExtracts.reduce(
        (acc, extract) => acc + (extract.contentTokenCount || 0),
        0
      );

      // Log the token count update
      this.log("Topic token count updated:", {
        topicId: topic.id,
        title: topic.title,
        newTokenCount: topicTokenCount,
        extractsCount: scratchpad.contentExtracts.length,
      });

      // Emit topic update with token count while preserving status
      this.emitProgress({
        type: "topic",
        data: {
          topic: {
            ...topic,
            status: "exploring",
            tokenCount: topicTokenCount,
          },
        },
      });

      if (topicTokenCount >= 3_000) {
        this.log("Reached max tokens, stopping exploration");
        this.emitAgentStatus(
          "Reached max tokens for topic, stopping exploration"
        );
        // Emit final topic update with completed status
        this.emitProgress({
          type: "topic",
          data: {
            topic: {
              ...topic,
              status: "completed",
              tokenCount: topicTokenCount,
            },
          },
        });
        break;
      }
    }
    // Emit final topic update if we didn't hit the token limit
    if (topicTokenCount < 3_000) {
      this.emitProgress({
        type: "topic",
        data: {
          topic: {
            ...topic,
            status: "completed",
            tokenCount: topicTokenCount,
          },
        },
      });
    }

    const result: ExplorationResult = {
      topic: {
        ...topic,
        status: "completed",
        tokenCount: topicTokenCount,
      },
      relevantContent: scratchpad.contentExtracts,
      scratchpad,
    };

    this.log(`Completed exploration of topic: ${topic.title}`, {
      contentCount: scratchpad.contentExtracts.length,
      finalTokenUsage: this.tokenUsage,
      topicTokenCount,
    });

    return result;
  }

  public getLogs(): string[] {
    return this.logs;
  }

  private async exploreTopics(
    spec: ResearchSpec,
    options: ResearchServiceOptions
  ): Promise<ExplorationResult[]> {
    const initialTopics = await this.extractInitialTopics(spec);

    this.log("Starting topic exploration", {
      spec,
      maxDepth: options.maxDepth || 3,
    });

    // Explore each top-level topic
    const exploredTopics = new Set<string>();
    const results: ExplorationResult[] = [];

    for (const topic of initialTopics) {
      const result = await this.exploreTopic(
        topic,
        exploredTopics,
        initialTopics
      );
      results.push(result);
    }

    return results;
  }

  private async executeAction(
    action: ResearchAction,
    topic: Topic,
    scratchpad: Scratchpad
  ): Promise<ResearchAction[]> {
    this.log(`Executing action: ${action.type}`, { actionId: action.id });

    // Initialize scratchpad.researchActions if it doesn't exist
    if (!scratchpad.researchActions) {
      scratchpad.researchActions = [];
    }

    let newActions: ResearchAction[] = [];

    switch (action.type) {
      case "search_query": {
        // Execute the search query
        this.emitAgentStatus(`Executing search query: ${action.query}`);
        let results: SearchResult[] = [];
        try {
          results = await this.serpService.searchWeb(action.query, {
            num: 10,
          });
        } catch (error) {
          console.error("Error executing search query:", {
            error,
            query: action.query,
          });
        }

        // Convert results to research actions
        newActions = results
          .filter((result) => !scratchpad.browsedUrls.has(result.link))
          .map((result) => ({
            id: generateShortId(),
            type: "search_result" as const,
            url: result.link,
            title: result.title,
            snippet: result.snippet,
            originQuery: action.query,
          }));
        break;
      }

      case "search_result":
      case "extracted_url": {
        const url = action.url;
        if (scratchpad.browsedUrls.has(url)) {
          return []; // Skip if already browsed
        }

        // Scrape and analyze the URL
        this.emitAgentStatus(`Scraping URL: ${url}`);

        let result: ScrapedContent;
        try {
          result = await this.firecrawlService.scrapeUrl(url);
        } catch (error) {
          console.error("Error scraping URL:", { error, url });
          return [];
        }

        // Analyze the content
        const { analysis, tokenUsage } = await this.aiService.analyzeWebContent(
          result.content,
          {
            userIntent: topic.description,
            currentTopic: {
              title: topic.title,
              description: topic.description,
            },
            scratchpadState: {
              exploredUrls: Array.from(scratchpad.browsedUrls),
              contentExtracts: scratchpad.contentExtracts,
            },
          }
        );
        this.updateTokenUsage(tokenUsage);

        const contentExtract: ContentExtract = {
          url,
          content: analysis.relevantContent,
          relevanceScore: analysis.relevanceScore,
          extractedUrls: analysis.relevantUrls.map((u) => u.url),
          contentTokenCount: analysis.contentTokenCount,
        };
        scratchpad.contentExtracts.push(contentExtract);

        // Calculate new total token count for the topic
        const topicTokenCount = scratchpad.contentExtracts.reduce(
          (acc, extract) => acc + (extract.contentTokenCount || 0),
          0
        );

        // Log the token count update
        this.log("Topic token count updated after new content:", {
          topicId: topic.id,
          title: topic.title,
          newTokenCount: topicTokenCount,
          extractsCount: scratchpad.contentExtracts.length,
          lastExtractTokens: contentExtract.contentTokenCount,
        });

        // Emit content extract event
        this.emitProgress({
          type: "content_extract",
          data: { contentExtract },
        });

        // Emit topic update with new token count
        this.emitProgress({
          type: "topic",
          data: {
            topic: {
              ...topic,
              status: "exploring",
              tokenCount: topicTokenCount,
            },
          },
        });

        // Mark URL as browsed
        scratchpad.browsedUrls.add(url);

        // Convert relevant URLs to new actions
        const newUrlActions = analysis.relevantUrls.map((u) => ({
          id: generateShortId(),
          type: "extracted_url" as const,
          url: u.url,
          reason: u.reason,
        }));

        // Convert follow-up queries to new actions
        const newQueryActions = analysis.followUpQueries.map((q) => ({
          id: generateShortId(),
          type: "search_query" as const,
          query: q.query,
          reason: q.reason,
        }));

        newActions = [...newUrlActions, ...newQueryActions];
        break;
      }
    }

    return newActions;
  }
}
