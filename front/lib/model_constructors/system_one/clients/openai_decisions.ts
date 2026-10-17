import {
  decisionToResult,
  toDecisionCreateParams,
} from "@app/lib/model_constructors/sdk/openai_decisions/converters";
import { openaiStreamErrorToErrorEvent } from "@app/lib/model_constructors/sdk/openai_shared/stream_error";
import { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { OPENAI_DECISIONS_HOST } from "@app/lib/model_constructors/types/hosts";
import type {
  DecisionOptions,
  DecisionRequest,
} from "@app/lib/model_constructors/types/input/decisions";
import { OPENAI_LAB } from "@app/lib/model_constructors/types/labs";
import type { DecisionResult } from "@app/lib/model_constructors/types/output/decisions";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import OpenAI from "openai";

export abstract class OpenAIDecisionsSystemOne extends SystemOneEndpoint {
  static readonly lab = OPENAI_LAB;
  static readonly host = OPENAI_DECISIONS_HOST;

  protected abstract readonly baseUrl: string;

  private readonly apiKey: string | undefined;
  private _client: OpenAI | undefined;

  constructor({ OPENAI_API_KEY }: Credentials) {
    super();
    this.apiKey = OPENAI_API_KEY;
  }

  // Lazy: `baseUrl` is an abstract field, only set after subclass initializers run.
  private get client(): OpenAI {
    this._client ??= new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      // Decisions sit on the request path: the caller bounds latency, so no retries.
      maxRetries: 0,
    });
    return this._client;
  }

  async decide(
    request: DecisionRequest,
    { signal }: DecisionOptions = {}
  ): Promise<Result<DecisionResult, ErrorEvent>> {
    const metadata = this.metadata();

    try {
      const decision = await this.client.decisions.create(
        toDecisionCreateParams(request, metadata.model),
        { signal }
      );
      return decisionToResult(decision, request, metadata);
    } catch (error) {
      return new Err(openaiStreamErrorToErrorEvent(metadata, error, "OpenAI"));
    }
  }
}
