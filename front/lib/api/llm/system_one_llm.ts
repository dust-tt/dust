import { contributeFreeUsageCostForUser } from "@app/lib/api/llm/free_usage";
import { LLMRunLifecycle } from "@app/lib/api/llm/run_lifecycle";
import { emitLLMDurationMs } from "@app/lib/api/llm/telemetry";
import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { createLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import {
  mapErrorType,
  tokenUsageContentToTokenUsage,
} from "@app/lib/api/llm/transitionLLM";
import { emitTokenUsageMetrics } from "@app/lib/api/llm/usage_metrics";
import { getLLMUsageType } from "@app/lib/api/llm/usage_type";
import type { Authenticator } from "@app/lib/auth";
import type { DustSystemOneEndpointConstructor } from "@app/lib/llms/system_one/dust_system_one_endpoint";
import { USAGE_TYPE_FREE } from "@app/lib/metronome/constants";
import type { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type {
  DecisionOptions,
  DecisionRequest,
} from "@app/lib/model_constructors/types/input/decisions";
import type { DecisionResult } from "@app/lib/model_constructors/types/output/decisions";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import type { Result } from "@app/types/shared/result";
import { startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";
import pickBy from "lodash/pickBy";
import startCase from "lodash/startCase";

export type SystemOneLLMParameters = {
  credentials: LLMCredentialsType;
  endpoint: DustSystemOneEndpointConstructor;
  // Required: it decides whether the call is billed and tags every metric.
  context: LLMTraceContext;
};

/**
 * One instrumented decision call. Like the stream surface, every call is persisted as a run with a
 * pending usage row before the provider request, then priced from the usage it reports.
 */
export class SystemOneLLM {
  private readonly endpoint: DustSystemOneEndpointConstructor;
  private readonly model: SystemOneEndpoint;
  private readonly context: LLMTraceContext;
  private readonly traceId: LLMTraceId = createLLMTraceId(randomUUID());

  constructor(
    private readonly auth: Authenticator,
    { credentials, endpoint, context }: SystemOneLLMParameters
  ) {
    this.endpoint = endpoint;
    this.model = new endpoint(credentials);
    this.context = context;
  }

  getTraceId(): LLMTraceId {
    return this.traceId;
  }

  private get telemetryTags(): string[] {
    const { modelConfig, host, region } = this.endpoint;

    return [
      `model_id:${modelConfig.modelId}`,
      `provider_id:${modelConfig.providerId}`,
      `inference_provider:${host}`,
      `region:${region}`,
      `operation_type:${this.context.operationType}`,
      "surface:system_one",
    ];
  }

  async decide(
    request: DecisionRequest,
    options?: DecisionOptions
  ): Promise<Result<DecisionResult, ErrorEvent>> {
    const { modelConfig, host, region } = this.endpoint;
    const usageType = getLLMUsageType(this.auth, this.context);
    const lifecycle = await LLMRunLifecycle.start(this.auth, {
      dustRunId: this.traceId,
      inferenceProvider: host,
      modelId: modelConfig.modelId,
      providerId: modelConfig.providerId,
      reasoningEffort: "none",
      region,
      usageType,
    });

    const generation = startObservation(
      "llm-decision",
      { input: request, model: modelConfig.modelId },
      { asType: "generation" }
    );
    generation.updateTrace({
      name: startCase(this.context.operationType),
      metadata: {
        dustTraceId: this.traceId,
        ...pickBy(
          this.context,
          (value, key) =>
            value !== undefined && !["userId", "workspaceId"].includes(key)
        ),
      },
      userId: this.auth.getNonNullableWorkspace().sId,
    });

    const tags = this.telemetryTags;
    statsDMetrics.increment("llm_interaction.count", 1, tags);
    const startTime = Date.now();

    try {
      const result = await this.model.decide(request, options);
      const durationMs = Date.now() - startTime;

      if (result.isErr()) {
        const { type: errorType, errorSource } = result.error.content;
        statsDMetrics.increment("llm_error.count", 1, [
          ...tags,
          `error_type:${errorType}`,
          `error_source:${errorSource}`,
        ]);
        emitLLMDurationMs({
          durationMs,
          tags,
          outcome: "error",
          errorType: mapErrorType(errorType).type,
          errorSource,
        });
        generation
          .update({
            level: "ERROR",
            statusMessage: result.error.content.message,
          })
          .end();
        logger.warn(
          {
            errorContent: result.error.content,
            traceId: this.traceId,
            context: this.context,
            durationMs,
          },
          "System one decision failed"
        );
        return result;
      }

      const tokenUsage = tokenUsageContentToTokenUsage(result.value.usage);
      const costMicroUsd = await lifecycle.recordTokenUsage(tokenUsage);
      const user = this.auth.user();
      if (usageType === USAGE_TYPE_FREE && user && costMicroUsd) {
        await contributeFreeUsageCostForUser(
          this.auth.getNonNullableWorkspace(),
          user.id,
          costMicroUsd
        );
      }

      statsDMetrics.increment("llm_success.count", 1, tags);
      emitLLMDurationMs({ durationMs, tags, outcome: "success" });
      emitTokenUsageMetrics(tokenUsage, tags);
      if (costMicroUsd !== undefined) {
        statsDMetrics.distribution("llm_cost_micro_usd", costMicroUsd, tags);
      }
      generation
        .update({
          output: result.value.answers,
          usageDetails: {
            input: tokenUsage.inputTokens,
            output: tokenUsage.totalOutputTokens,
            total: tokenUsage.totalTokens,
          },
        })
        .end();

      return result;
    } finally {
      await lifecycle.close();
    }
  }
}
