import type { TypeSafeAiInputConfig } from "@app/lib/model_constructors/providers/typesafe_ai/inputConfig";
import type { SystemOneAnswer } from "@app/lib/model_constructors/system_one/endpoint";
import { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { TYPESAFE_AI_HOST } from "@app/lib/model_constructors/types/hosts";
import { TYPESAFE_AI_LAB } from "@app/lib/model_constructors/types/labs";
import type {
  ErrorContent,
  TokenUsageContent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { buildHttpStatusErrorEvent } from "@app/lib/model_constructors/utils/classify_http_status";
import { classifyStreamError } from "@app/lib/model_constructors/utils/classify_stream_error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  Fetch,
  Questions,
  SystemOneRequest,
  Usage,
} from "@typesafe-ai/sdk";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  TypeSafeClient,
  TypeSafeError,
} from "@typesafe-ai/sdk";

const PROVIDER_NAME = "TypeSafe AI";

export abstract class TypeSafeAiSystemOne extends SystemOneEndpoint<TypeSafeAiInputConfig> {
  static readonly lab = TYPESAFE_AI_LAB;
  static readonly host = TYPESAFE_AI_HOST;

  private readonly client: TypeSafeClient;

  /**
   * @cc [owner:pmilliotte,label:security] typesafe-api-key-comes-from-credentials
   * The `TypeSafeClient` MUST be constructed with an explicit `apiKey` taken from the passed
   * `Credentials`, including when that key is absent.
   *
   * The SDK resolves `config.apiKey ?? process.env.TYPESAFE_API_KEY`, so passing `undefined`
   * silently authenticates with whatever key the host environment holds. For a BYOK workspace
   * that substitutes a Dust-managed credential for the customer's own, breaking
   * `byok-credentials-are-customer-owned`. Passing the empty string keeps the fallback
   * unreachable and surfaces the misconfiguration as an authentication error instead.
   */
  constructor({ TYPESAFE_AI_API_KEY }: Credentials, fetchImpl?: Fetch) {
    super();
    this.client = new TypeSafeClient({
      apiKey: TYPESAFE_AI_API_KEY ?? "",
      // The caller owns retries so every attempt gets its own Dust trace.
      retry: { maxRetries: 0 },
      // The SDK's seam for transport configuration and tests; omitted in
      // production so it uses the global `fetch`.
      ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
    });
  }

  async answer<const Q extends Questions>(
    request: SystemOneRequest<Q>
  ): Promise<Result<SystemOneAnswer<Q>, ErrorContent>> {
    try {
      const { answers, usage } = await this.client.systemOne({
        ...request,
        model: this.constructor.model,
      });
      return new Ok({
        answers,
        usage: toTokenUsageContent(usage),
        metadata: this.metadata(),
      });
    } catch (error) {
      return new Err(this.toErrorContent(error));
    }
  }

  private toErrorContent(error: unknown): ErrorContent {
    const metadata = this.metadata();

    if (error instanceof APIError) {
      return buildHttpStatusErrorEvent({
        metadata,
        status: error.status,
        provider: PROVIDER_NAME,
        detail: error.message,
        originalError: error,
      }).content;
    }

    // Raised before any request leaves the process: a missing key, an empty
    // question set, or score criteria that are not a list. Dust built the
    // request, so Dust owns the fault.
    const isRequestRejectedLocally =
      error instanceof TypeSafeError && !(error instanceof APIConnectionError);
    if (isRequestRejectedLocally) {
      return buildErrorEvent({
        metadata,
        type: "invalid_request_error",
        message: `Invalid request to ${PROVIDER_NAME}: ${normalizeError(error).message}`,
        originalError: error,
        errorSource: "dust",
      }).content;
    }

    return classifyStreamError({
      error,
      metadata,
      providerName: PROVIDER_NAME,
      sdkClass: toStreamErrorSdkClass(error),
    }).content;
  }
}

// `APITimeoutError` extends `APIConnectionError`, so it must be tested first.
function toStreamErrorSdkClass(error: unknown) {
  if (error instanceof APITimeoutError) {
    return "timeout" as const;
  }
  if (error instanceof APIConnectionError) {
    return "connection" as const;
  }
  return undefined;
}

// System one bills on plain input and output counts; it exposes no prompt
// cache and no reasoning breakdown, so the remaining counters stay at zero.
function toTokenUsageContent(usage: Usage): TokenUsageContent {
  return {
    longCacheCreated: 0,
    shortCacheCreated: 0,
    cacheCreated: 0,
    cacheHit: 0,
    standardInput: usage.input_tokens,
    totalOutput: usage.output_tokens,
  };
}
