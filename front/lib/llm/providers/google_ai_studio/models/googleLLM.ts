import type { Content, FunctionDeclaration } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";
import { conversationToGoogleInput } from "@app/lib/llm/providers/google_ai_studio/models/specTools";
import type { StreamEvent } from "@app/lib/llm/types";

import { LLM } from "../../../index";

export class GoogleLLM extends LLM {
  private genAI: GoogleGenAI;

  constructor({ temperature }: { temperature: number }) {
    super({
      temperature,
      model: "gemini-2.5-pro",
      provider: "google_ai_studio",
    });
    this.genAI = new GoogleGenAI({
      apiKey: process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
    });
  }

  protected conversationToModelInput({
    conversation,
    prompt,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
  }): { systemInstruction: string; messages: Content[] } {
    const { messages } = conversation;
    const result = [];

    const inputs = conversationToGoogleInput({ messages });

    for (const input of inputs) {
      result.push(input);
    }

    return { systemInstruction: prompt, messages: inputs };
  }

  protected specificationsToTools(
    specifications: AgentActionSpecification[]
  ): { functionDeclarations: FunctionDeclaration[] }[] {
    if (specifications.length === 0) {
      return [];
    }

    const functionDeclarations = specifications.map((spec) => ({
      name: spec.name,
      description: spec.description,
      parametersJsonSchema: spec.inputSchema as Record<string, unknown>,
    }));

    return [{ functionDeclarations }];
  }

  async *streamResponse({
    conversation,
    prompt,
    step,
    specifications,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
    step: number;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<StreamEvent, void, unknown> {
    const { systemInstruction, messages } = this.conversationToModelInput({
      conversation,
      prompt,
    });

    // Prepare contents: combine system instruction and history
    const contents = [
      {
        role: "user" as const,
        parts: [{ text: systemInstruction }],
      },
      ...messages,
    ];

    // Convert specifications to tools
    const tools = this.specificationsToTools(specifications);

    const input = {
      model: this.model,
      contents,
      config: {
        temperature: this.temperature,
        maxOutputTokens: 4096,
        ...(tools.length > 0 && { tools }),
        thinkingConfig: {
          thinkingBudget: -1,
          includeThoughts: true,
        },
      },
    };

    const streamResult = await this.genAI.models.generateContentStream(input);

    const geminiResponse = [];

    for await (const chunk of streamResult) {
      geminiResponse.push(chunk);

      const streamEvent = this.modelOutputToStreamEvent(chunk);
      if (streamEvent) {
        yield streamEvent;
      }
    }

    // Write action stream events to JSON file for debugging
    const actionOutputPath = path.join(
      process.cwd(),
      `lib/llm/providers/google_ai_studio/models/logs/gemini_2_5_pro_output_${step}.json`
    );
    fs.writeFileSync(actionOutputPath, JSON.stringify(geminiResponse, null, 2));
  }

  protected modelOutputToStreamEvent(chunk: any): StreamEvent | null {
    if (!chunk.candidates || chunk.candidates.length === 0) {
      return null;
    }

    const candidate = chunk.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      return null;
    }

    // Stream text content
    const textPart = candidate.content.parts.find((part: any) => part.text);
    if (textPart && textPart.text) {
      return {
        type: "tokens",
        content: {
          tokens: {
            text: textPart.text,
          },
        },
      };
    }

    return null;
  }
}
