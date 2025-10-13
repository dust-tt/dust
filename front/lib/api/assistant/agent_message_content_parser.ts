import escapeRegExp from "lodash/escapeRegExp";

import { getSupportedModelConfig } from "@app/lib/assistant";
import type {
  GenerationTokensEvent,
  LightAgentConfigurationType,
} from "@app/types";
import { assertNever } from "@app/types";
import { CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION } from "@app/types/assistant/chain_of_thought_meta_prompt";

type AgentMessageTokenClassification = GenerationTokensEvent["classification"];

type DelimitersConfiguration = {
  delimiters: Array<{
    openingPattern: string;
    closingPattern: string;
    classification: Exclude<
      GenerationTokensEvent["classification"],
      "opening_delimiter" | "closing_delimiter"
    >;
    swallow: boolean;
  }>;
  // If one of these patterns is found at the end of a model event, we'll wait for the
  // the next event before emitting tokens.
  incompleteDelimiterPatterns: RegExp[];
};

export class AgentMessageContentParser {
  private buffer: string = "";
  private content: string = "";
  private chainOfThought: string = "";
  private visualizations: string[] = [""];

  private currentDelimiter: string | null = null;

  private pattern?: RegExp;
  private incompleteDelimiterPattern?: RegExp;
  private specByDelimiter: Record<
    string,
    {
      classification: Exclude<
        AgentMessageTokenClassification,
        "opening_delimiter" | "closing_delimiter"
      >;
      swallow: boolean;
    } & (
      | { type: "opening_delimiter"; closing_delimiter: string }
      | { type: "closing_delimiter"; opening_delimiter: string }
    )
  >;

  constructor(
    private agentConfiguration: LightAgentConfigurationType,
    private messageId: string,
    delimitersConfiguration: DelimitersConfiguration
  ) {
    this.buffer = "";
    this.content = "";
    this.chainOfThought = "";

    // Ensure no duplicate delimiters.
    const allDelimitersArray =
      delimitersConfiguration?.delimiters.flatMap(
        ({ openingPattern, closingPattern }) => [
          escapeRegExp(openingPattern),
          escapeRegExp(closingPattern),
        ]
      ) ?? [];

    if (allDelimitersArray.length !== new Set(allDelimitersArray).size) {
      throw new Error("Duplicate delimiters in the configuration");
    }

    // Store mapping of delimiters to their spec.
    this.specByDelimiter =
      delimitersConfiguration?.delimiters.reduce(
        (acc, { openingPattern, closingPattern, classification, swallow }) => {
          acc[openingPattern] = {
            type: "opening_delimiter" as const,
            closing_delimiter: closingPattern,
            classification,
            swallow,
          };
          acc[closingPattern] = {
            type: "closing_delimiter" as const,
            opening_delimiter: openingPattern,
            classification,
            swallow,
          };
          return acc;
        },
        {} as AgentMessageContentParser["specByDelimiter"]
      ) ?? {};

    // Store the regex pattern that match any of the delimiters.
    this.pattern = allDelimitersArray.length
      ? new RegExp(allDelimitersArray.join("|"))
      : undefined;

    // Store the regex pattern that match incomplete delimiters.
    this.incompleteDelimiterPattern =
      // Merge all the incomplete deletimter regexes into a single one.
      delimitersConfiguration?.incompleteDelimiterPatterns.length
        ? new RegExp(
            delimitersConfiguration.incompleteDelimiterPatterns
              .map((r) => r.source)
              .join("|")
          )
        : undefined;
  }

  async *flushTokens({
    upTo,
  }: {
    upTo?: number;
  } = {}): AsyncGenerator<GenerationTokensEvent> {
    if (!this.buffer.length) {
      return;
    }

    if (!this.swallow) {
      const text =
        upTo === undefined ? this.buffer : this.buffer.substring(0, upTo);

      const currentClassification = this.currentTokenClassification();

      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: this.agentConfiguration.sId,
        messageId: this.messageId,
        text,
        classification: currentClassification,
      };

      if (currentClassification === "chain_of_thought") {
        this.chainOfThought += text;
      } else if (currentClassification === "tokens") {
        this.content += text;
      } else {
        assertNever(currentClassification);
      }
    }

    this.buffer = upTo === undefined ? "" : this.buffer.substring(upTo);
  }

  async *emitTokens(text: string): AsyncGenerator<GenerationTokensEvent> {
    // Add text of the new event to the buffer.
    this.buffer += text;
    if (!this.pattern) {
      yield* this.flushTokens();
      return;
    }

    if (this.incompleteDelimiterPattern?.test(this.buffer)) {
      // Wait for the next event to complete the delimiter.
      return;
    }

    let match: RegExpExecArray | null;
    while ((match = this.pattern.exec(this.buffer))) {
      const del = match[0];
      const index = match.index;

      // Emit text before the delimiter as 'text' or 'chain_of_thought'
      if (index > 0) {
        yield* this.flushTokens({ upTo: index });
      }

      const delimiterSpec = this.specByDelimiter[del];

      // Check if the delimiter is closing the current delimiter.
      if (
        this.currentDelimiter &&
        delimiterSpec.type === "closing_delimiter" &&
        delimiterSpec.opening_delimiter === this.currentDelimiter
      ) {
        this.currentDelimiter = null;

        if (delimiterSpec.classification === "chain_of_thought") {
          // Closing the chain of thought section: we yield a newline in the CoT to separate blocks.
          const separator = "\n";
          yield {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: this.agentConfiguration.sId,
            messageId: this.messageId,
            text: separator,
            classification: "chain_of_thought",
          };
          this.chainOfThought += separator;
        } else if (delimiterSpec.classification === "tokens") {
          // Nothing specific to do
        } else {
          assertNever(delimiterSpec.classification);
        }
      }

      // If we have no current delimiter and the delimiter is an opening delimiter, set it as the current delimiter.
      if (
        // We don't support nested delimiters. If a delimiter is already opened, we ignore the new one.
        !this.currentDelimiter &&
        delimiterSpec.type === "opening_delimiter"
      ) {
        this.currentDelimiter = del;
      }

      // Emit the delimiter itself
      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: this.agentConfiguration.sId,
        messageId: this.messageId,
        text: del,
        classification: delimiterSpec.type,
        delimiterClassification: delimiterSpec.classification,
      } satisfies GenerationTokensEvent;

      // Update the buffer
      this.buffer = this.buffer.substring(del.length);
    }

    // Emit the remaining text/chain_of_thought.
    yield* this.flushTokens();
  }

  async parseContents(contents: string[]): Promise<{
    content: string | null;
    chainOfThought: string | null;
    visualizations: string[];
  }> {
    for (const content of contents) {
      for await (const _event of this.emitTokens(content)) {
        void _event;
      }
    }
    for await (const _event of this.flushTokens()) {
      void _event;
    }

    return {
      content: this.content.length ? this.content : null,
      chainOfThought: this.chainOfThought.length ? this.chainOfThought : null,
      // Remove empty viz, since we always insert a trailing empty viz in the array (to indicate the previous one is closed)
      visualizations: this.visualizations.filter((v) => !!v),
    };
  }

  getContent(): string | null {
    return this.content.length ? this.content : null;
  }

  getChainOfThought(): string | null {
    return this.chainOfThought.length ? this.chainOfThought : null;
  }

  private currentTokenClassification(): Exclude<
    AgentMessageTokenClassification,
    "opening_delimiter" | "closing_delimiter"
  > {
    if (!this.currentDelimiter) {
      return "tokens";
    }

    return this.specByDelimiter[this.currentDelimiter].classification;
  }

  private get swallow(): boolean {
    if (!this.currentDelimiter) {
      return false;
    }
    return this.specByDelimiter[this.currentDelimiter].swallow;
  }
}

export function getDelimitersConfiguration({
  agentConfiguration,
}: {
  agentConfiguration: LightAgentConfigurationType;
}): DelimitersConfiguration {
  const model = getSupportedModelConfig(agentConfiguration.model);
  const reasoningEffort =
    agentConfiguration.model.reasoningEffort ?? model.defaultReasoningEffort;
  if (reasoningEffort !== "light") {
    return {
      delimiters: [],
      incompleteDelimiterPatterns: [],
    };
  }
  return {
    delimiters: CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION.delimiters,
    incompleteDelimiterPatterns:
      CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION.incompleteDelimiterPatterns,
  };
}
