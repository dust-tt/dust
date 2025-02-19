import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_MODEL } from "../config";
import type {
  TokenUsage,
  ResearchPlan,
  ContentExtract,
  Scratchpad,
  ExplorationResult,
} from "../types/research";
import { get_encoding } from "tiktoken";

interface ResearchSubTopic {
  title: string;
  description: string;
  importance: string;
  confidenceScore: number;
}

interface SearchQueryPlan {
  queries: Array<{
    query: string;
    explanation: string;
  }>;
}

interface RelevantUrl {
  url: string;
  reason: string;
}

interface ContentAnalysis {
  relevantContent: string;
  relevanceScore: number;
  explanation: string;
  relevantUrls: RelevantUrl[];
  contentTokenCount: number;
  followUpQueries: Array<{
    query: string;
    reason: string;
  }>;
}

interface ReportSection {
  title: string;
  description: string;
}

interface ReportSectionContent {
  content: string;
  citations: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
}

interface SearchResultAction {
  id: string;
  type: "search_result";
  url: string;
  title: string;
  snippet: string;
  originQuery: string;
}

interface SearchQueryAction {
  id: string;
  type: "search_query";
  query: string;
  reason: string;
}

interface ExtractedUrlAction {
  id: string;
  type: "extracted_url";
  url: string;
  reason: string;
}

export type ResearchAction =
  | SearchResultAction
  | SearchQueryAction
  | ExtractedUrlAction;

export class AIService {
  private client: OpenAI;
  private tokenUsage: TokenUsage;

  constructor() {
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is required");
    }
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  private log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
  }

  private updateTokenUsage(usage: OpenAI.CompletionUsage): TokenUsage {
    this.tokenUsage = {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
    return { ...this.tokenUsage };
  }

  private ensureTokenUsage(response: OpenAI.Chat.ChatCompletion): TokenUsage {
    if (!response.usage) {
      throw new Error("OpenAI API response missing token usage information");
    }
    return this.updateTokenUsage(response.usage);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    const maxRetries = 3;
    const initialDelay = 1000; // 1 second
    const backoffFactor = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          console.error(
            `Failed ${context} after ${maxRetries} attempts:`,
            error
          );
          throw error;
        }

        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        console.log(
          `${context} attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed ${context} after all retries`);
  }

  async createResearchPlan(
    topic: string
  ): Promise<{ plan: ResearchPlan; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a research planning agent. Your task is to create an ordered list of top-level topics that will be explored sequentially to comprehensively answer a research query.",
          },
          {
            role: "user",
            content: `Create an ordered research plan for: ${topic}

Requirements:
- Generate between 2-5 top-level topics
- Each topic should be distinct and focused
- Topics should be broad enough to warrant deep exploration
- Together, they should cover all aspects of the research intent
- Topics SHOULD NOT be generic, they should cover one or several specific aspects of the research intent.

Format each topic with:
- A clear, specific title. This title can be long if needed.
- A detailed description explaining what this topic covers and why it's important
- How it relates to other topics in the sequence

Remember: These are the main research topics that will guide our entire investigation. After this investigation is complete, we will write a highly detailed report about the research intent.`,
          },
        ],
        functions: [
          {
            name: "plan_research_topics",
            description: "Create an ordered list of main research topics",
            parameters: {
              type: "object",
              properties: {
                subTopics: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description:
                          "Title of the topic. This title can be long if needed.",
                      },
                      description: {
                        type: "string",
                        description:
                          "Detailed description of what this topic covers and its importance",
                      },
                    },
                    required: ["title", "description"],
                  },
                  description: "Ordered list of 2-5 main topics to explore",
                  minItems: 2,
                  maxItems: 5,
                },
              },
              required: ["subTopics"],
            },
          },
        ],
        function_call: { name: "plan_research_topics" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to create research plan");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      return {
        plan: JSON.parse(functionCall.arguments) as ResearchPlan,
        tokenUsage,
      };
    }, "creating research plan");
  }

  async generateSearchQueriesForTopic(
    mainTopic: string,
    subTopic: ResearchSubTopic
  ): Promise<{ queryPlan: SearchQueryPlan; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a search query planning agent. Your job is to generate specific search engine queries that will help gather information about a sub-topic of a larger research topic. For each query, provide a clear explanation of what specific information it aims to find.",
          },
          {
            role: "user",
            content: `Main research topic: ${mainTopic}\n\nSub-topic to explore: ${subTopic.title}\nDescription: ${subTopic.description}`,
          },
        ],
        functions: [
          {
            name: "plan_search_queries",
            description:
              "Plan search engine queries to explore a specific sub-topic",
            parameters: {
              type: "object",
              properties: {
                queries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      explanation: {
                        type: "string",
                        description:
                          "Explanation of what specific information this query aims to find",
                      },
                      query: {
                        type: "string",
                        description: "The search query to execute",
                      },
                    },
                    required: ["query", "explanation"],
                  },
                  description:
                    "List of search engine queries with their explanations",
                },
              },
              required: ["queries"],
            },
          },
        ],
        function_call: { name: "plan_search_queries" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to generate search queries");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      return {
        queryPlan: JSON.parse(functionCall.arguments) as SearchQueryPlan,
        tokenUsage,
      };
    }, "generating search queries");
  }

  async analyzeWebContent(
    content: string,
    context: {
      userIntent: string;
      currentTopic: {
        title: string;
        description: string;
      };
      scratchpadState: {
        exploredUrls: string[];
        contentExtracts?: ContentExtract[];
      };
    }
  ): Promise<{ analysis: ContentAnalysis; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a content analysis agent. Your task is to extract relevant information from web content and identify both relevant URLs and potential follow-up search queries. Consider all previously gathered information to maintain context and avoid redundancy.",
          },
          {
            role: "user",
            content: `
Overall Research Intent: ${context.userIntent}

Current Topic:
Title: ${context.currentTopic.title}
Description: ${context.currentTopic.description}

Current Research State:
${
  context.scratchpadState.contentExtracts?.length
    ? `
Previously Gathered Information:
${context.scratchpadState.contentExtracts
  .map(
    (extract) => `
[Source: ${extract.url}
${extract.content}
---`
  )
  .join("\n")}
`
    : "Nothing gathered yet"
}

New Content to Analyze:
${content}

Instructions:
1. Analyze how this new content relates to our existing knowledge
2. Identify any new information not covered in previous extracts
3. Extract relevant and non-redundant information. Extracted information must be relevant both to the current topic and the overall research intent.
4. Consider the overall research context
5. Look for URLs that might provide additional perspectives
6. Generate follow-up search queries to explore gaps or interesting angles discovered in the content
`,
          },
        ],
        functions: [
          {
            name: "extract_relevant_content",
            description:
              "Extract relevant information, URLs, and follow-up queries from the content",
            parameters: {
              type: "object",
              properties: {
                explanation: {
                  type: "string",
                  description:
                    "Explanation of why this content is relevant or redundant, and how it relates to our existing knowledge",
                },
                relevanceScore: {
                  type: "number",
                  description:
                    "Score from 0-1 indicating how relevant and novel this content is to the topic",
                },
                relevantContent: {
                  type: "string",
                  description:
                    "Information extracted from the content. Should be empty string if content is irrelevant or completely redundant with existing knowledge. Exhaustively include new, non-redundant information verbatim. This extracted information will be used to produce a detailed research report. Only include information that is relevant to the current topic and the overall research intent.",
                },
                relevantUrls: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      reason: {
                        type: "string",
                        description:
                          "Reason why this URL might be worth exploring",
                      },
                      url: {
                        type: "string",
                        description: "URL found in the content",
                      },
                    },
                    required: ["url", "reason"],
                  },
                  description:
                    "URLs found in the content that might provide additional information",
                },
                followUpQueries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      reason: {
                        type: "string",
                        description:
                          "Why this query would be useful based on the analyzed content",
                      },
                      query: {
                        type: "string",
                        description: "The search query to execute",
                      },
                    },
                    required: ["query", "reason"],
                  },
                  description:
                    "Follow-up Google search queries to explore gaps or interesting angles discovered in the content",
                },
              },
              required: [
                "explanation",
                "relevanceScore",
                "relevantContent",
                "relevantUrls",
                "followUpQueries",
              ],
            },
          },
        ],
        function_call: { name: "extract_relevant_content" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to analyze content");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      const analysis = JSON.parse(functionCall.arguments) as ContentAnalysis;

      // Calculate token count for the relevant content
      const contentTokenCount = this.countTokens(analysis.relevantContent);
      this.log("Content token count calculated:", {
        contentTokenCount,
        contentLength: analysis.relevantContent.length,
      });

      // Add token count to the analysis
      analysis.contentTokenCount = contentTokenCount;

      return {
        analysis,
        tokenUsage,
      };
    }, "analyzing web content");
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  countTokens(text: string): number {
    const enc = get_encoding("cl100k_base");

    // Encode the text and get the tokens
    const tokens = enc.encode(text);

    // Free the encoding to prevent memory leaks
    enc.free();

    // Return the number of tokens
    return tokens.length;
  }

  async pickNextAction(
    researchPool: ResearchAction[],
    scratchpad: Scratchpad,
    otherTopics?: Array<{ id: string; title: string; description: string }>
  ): Promise<{
    selectedActionId: string;
    explanation: string;
    tokenUsage: TokenUsage;
  }> {
    return this.withRetry(async () => {
      // Get the 5 most recent actions, sorted by timestamp
      const recentActions = (scratchpad.researchActions || [])
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 5);

      // Format the available actions for the prompt
      const formattedActions = researchPool
        .map((action) => {
          switch (action.type) {
            case "search_result":
              return `[ID: ${action.id}] Browse and analyze URL (from search result)
URL: ${action.url}
Title: ${action.title}
Context: ${action.snippet}`;

            case "search_query":
              // Group all search results for this query
              const resultsForQuery = researchPool.filter(
                (a): a is SearchResultAction =>
                  a.type === "search_result" && a.originQuery === action.query
              );
              return `[ID: ${action.id}] Search Query
Query: ${action.query}
Reason: ${action.reason}
${
  resultsForQuery.length > 0
    ? `\nSearch Results for: "${action.query}"
${resultsForQuery
  .map(
    (a) => `- [ID: ${a.id}] ${a.title}
  URL: ${a.url}
  Context: ${a.snippet}`
  )
  .join("\n")}`
    : ""
}`;

            case "extracted_url":
              return `[ID: ${action.id}] Browse and analyze URL (from web page)
URL: ${action.url}
Context: ${action.reason}`;
          }
        })
        .join("\n\n");

      // Format other topics to avoid overlap
      const otherTopicsSection = otherTopics
        ? otherTopics
            .map((topic) => `- ${topic.title}: ${topic.description}`)
            .join("\n")
        : "No other topics to consider.";

      // Format previously gathered content
      const previousContent = scratchpad.contentExtracts
        .map(
          (extract) => `
[Source: ${extract.url}]
${extract.content}
---`
        )
        .join("\n");

      // Format recent action history
      const actionHistory = recentActions
        .map(
          (action) =>
            `${action.action.type}: ${
              action.action.type === "search_query"
                ? action.action.query
                : action.action.url
            }`
        )
        .join("\n");

      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a research agent helping to explore a topic. Your task is to analyze the current state of research and pick the most promising next action from the available options.
            
Each action in the research pool has a unique ID. You must return the ID of the single most promising action based on:

1. Novelty and Coverage:
   - Prioritize actions that explore new aspects of the topic not covered by recent actions
   - Favor actions that will provide a broad overview rather than deep dives into already explored areas
   - Consider how the action complements the information already gathered

2. Action Type Balance:
   - It's not useful to repeatedly execute search queries without exploring the results
   - That being said, if the current pool of actions don't include enough potential URLs to browse, then it's useful to execute a search query to expand the pool
   - Immediately after a search query, do not execute another search query. Instead, execute a URL analysis action.

3. Source Quality and Relevance:
   - For URLs: evaluate credibility, relevance, and potential for unique information
   - For search queries: assess specificity, focus, and potential to uncover new aspects
   
Avoid browsing pages that talk about the same topics as the previous content. Avoid browsing pages that seem to talk about generic topics that are not specific to the current research intent.
Avoid suggesting follow-up queries or URLs that are too broad or generic.

Avoid executing several search queries in a row. After a search query, execute a URL analysis action based on the results of the search query, unless the pool of available actions doesn't include URLs that seem relevant.

If a topic seems important and not covered in the gathered content, then it is crucial to immediately browse URLs that might cover this topic.`,
          },
          {
            role: "user",
            content: `Current Research State:
Topic: ${scratchpad.topicId}

Recent Action History:
${actionHistory}

Previously Gathered Content:
${previousContent}

Available Actions:
${formattedActions}

Pick the single most promising action ID and explain why it's the best next step, considering:
1. How it balances the types of actions taken recently
2. How it explores novel aspects not covered by recent actions
3. How it contributes to a broad understanding of the topic
4. How it is not redundant with the previous content
5. How it is not too broad or generic
6. How it covers important topics that are not covered in the previous content

You must always return a valid action ID. It is not acceptable to return an empty string or null.

Remember that the following topics will be explored separately, so avoid actions that would overlap with them significantly:
${otherTopicsSection}`,
          },
        ],
        functions: [
          {
            name: "select_next_action",
            description:
              "Select the most promising action from the research pool",
            parameters: {
              type: "object",
              properties: {
                explanation: {
                  type: "string",
                  description:
                    "Explanation of why this action was selected as the most promising next step",
                },
                selectedActionId: {
                  type: "string",
                  description: "The ID of the selected action",
                },
              },
              required: ["selectedActionId", "explanation"],
            },
          },
        ],
        function_call: { name: "select_next_action" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to select next action");
      }

      const result = JSON.parse(functionCall.arguments) as {
        selectedActionId: string;
        explanation: string;
      };

      return {
        selectedActionId: result.selectedActionId,
        explanation: result.explanation,
        tokenUsage: this.tokenUsage,
      };
    }, "selecting next action");
  }

  async generateClarifyingQuestions(
    query: string
  ): Promise<{ questions: string[]; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a research planning agent. Your task is to generate specific, focused questions that will help clarify and refine a research topic. The questions should help understand the user's specific interests, requirements, and desired scope.",
          },
          {
            role: "user",
            content: `Generate clarifying questions for this research topic: "${query}"`,
          },
        ],
        functions: [
          {
            name: "generate_questions",
            description: "Generate clarifying questions for the research topic",
            parameters: {
              type: "object",
              properties: {
                reasoning: {
                  type: "string",
                  description:
                    "Brief explanation of why these questions will help clarify the research needs",
                },
                questions: {
                  type: "array",
                  items: {
                    type: "string",
                    description:
                      "A clear, specific question that helps understand the research needs",
                  },
                  description: "List of 3-4 clarifying questions",
                  minItems: 3,
                  maxItems: 4,
                },
              },
              required: ["questions", "reasoning"],
            },
          },
        ],
        function_call: { name: "generate_questions" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to generate clarifying questions");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      const result = JSON.parse(functionCall.arguments) as {
        questions: string[];
        reasoning: string;
      };

      return {
        questions: result.questions,
        tokenUsage,
      };
    }, "generating clarifying questions");
  }

  async generateReportSections(
    unifiedIntent: string,
    results: ExplorationResult[]
  ): Promise<{ sections: ReportSection[]; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a research report structuring agent. Your task is to analyze the research intent and gathered content to propose a logical structure for the final report. Consider:

1. The original research intent and its scope
2. The actual content gathered during research
3. Natural groupings and progression of information
4. Importance and relevance of different aspects
5. How to present information in a way that builds understanding

Create sections that:
- Flow logically from foundational concepts to advanced topics
- Group related information effectively
- Cover all major aspects discovered in the research
- Avoid redundancy while ensuring completeness
- Map clearly to the content we have available`,
          },
          {
            role: "user",
            content: `Research Intent:
${unifiedIntent}

Content Gathered:
${results
  .map(
    (result) => `
Topic: ${result.topic.title}
Description: ${result.topic.description}

Content Extracts:
${result.relevantContent
  .map(
    (extract: ContentExtract) => `
[Source: ${extract.url}]
${extract.content}
---`
  )
  .join("\n")}`
  )
  .join("\n\n")}

Based on this research intent and the content we've gathered, propose a logical structure for the final report. Each section should map to content we actually have from our research.`,
          },
        ],
        functions: [
          {
            name: "propose_report_sections",
            description:
              "Propose a logical structure of sections for the research report",
            parameters: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description: "Clear, descriptive title for the section",
                      },
                      description: {
                        type: "string",
                        description:
                          "Brief description of what this section will cover",
                      },
                    },
                    required: ["title", "description"],
                  },
                  description: "Ordered list of sections for the report",
                },
              },
              required: ["sections"],
            },
          },
        ],
        function_call: { name: "propose_report_sections" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to generate report sections");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      const result = JSON.parse(functionCall.arguments) as {
        sections: ReportSection[];
      };

      this.log("Generated report sections:", {
        sectionCount: result.sections.length,
        sections: result.sections.map((s) => s.title),
      });

      return {
        sections: result.sections,
        tokenUsage,
      };
    }, "generating report sections");
  }

  async generateReportSectionContent(
    section: ReportSection,
    allSections: ReportSection[],
    writtenSections: Record<string, string>,
    results: ExplorationResult[]
  ): Promise<{ content: ReportSectionContent; tokenUsage: TokenUsage }> {
    return this.withRetry(async () => {
      const relevantContent = results
        .map((result) => {
          return result.relevantContent.map((extract) => ({
            content: extract.content,
            url: extract.url,
          }));
        })
        .flat();

      const response = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a research report writing agent. You have a PhD in the domain of the report. Your task is to write a detailed section of a research report based on the provided content. Consider:

1. The section's role in the overall report structure
2. Previously written sections for context
3. The specific content available for this section
4. The need for clear organization and flow
5. Proper citation of sources

Write the section to:
- Be very thorough and comprehensive yet focused on its specific topic
- Flow naturally from previous sections
- Use clear, professional language
- Cite sources appropriately
- Maintain a consistent level of technical detail

Do not repeat the title of the section in the content. If the section includes sub-sections, make sure to use markdown to indicate the sub-sections, starting with heading level 3.

`,
          },
          {
            role: "user",
            content: `Report Structure:
${allSections
  .map(
    (s, i) => `${i + 1}. ${s.title}
   ${s.description}`
  )
  .join("\n")}

Previously Written Sections:
${Object.entries(writtenSections)
  .map(([title, content]) => `## ${title}\n${content}`)
  .join("\n\n")}

Current Section to Write:
Title: ${section.title}
Description: ${section.description}

Available Content:
${relevantContent
  .map(
    (content, i) => `
[Source ${i + 1}: ${content.url}]
${content.content}
---`
  )
  .join("\n")}

Write this section of the report using the available content. Ensure proper flow with existing sections and appropriate citation of sources.`,
          },
        ],
        functions: [
          {
            name: "write_report_section",
            description: "Write a section of the research report",
            parameters: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description:
                    "The full content of the section, written in a clear, professional style with appropriate organization",
                },
                citations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: {
                        type: "string",
                        description: "URL of the cited source",
                      },
                      title: {
                        type: "string",
                        description: "Title or description of the citation",
                      },
                    },
                    required: ["url", "title"],
                  },
                  description:
                    "List of sources cited in the section, with relevant snippets",
                },
              },
              required: ["content", "citations"],
            },
          },
        ],
        function_call: { name: "write_report_section" },
      });

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error("Failed to generate section content");
      }

      const tokenUsage = this.ensureTokenUsage(response);
      const result = JSON.parse(functionCall.arguments) as ReportSectionContent;

      this.log("Generated section content:", {
        sectionTitle: section.title,
        contentLength: result.content.length,
        citationCount: result.citations.length,
      });

      return {
        content: result,
        tokenUsage,
      };
    }, "generating report section content");
  }
}
