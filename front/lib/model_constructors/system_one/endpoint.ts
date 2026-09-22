import { Client } from "@app/lib/model_constructors/client";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type {
  ErrorContent,
  TokenUsageContent,
} from "@app/lib/model_constructors/types/output/events";
import type { Result } from "@app/types/shared/result";
import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";

// ponytail: the question and answer vocabulary is TypeSafe's, re-exported
// rather than mirrored into Dust types. It buys per-call inference of the
// answer shape from the question criteria, which a hand-rolled copy would have
// to reproduce in full. If a second system-one provider appears, these three
// types move to Dust and the client converts.
export type SystemOneAnswer<Q extends Questions> = {
  answers: SystemOneResult<Q>["answers"];
  // Reuses the stream/batch usage shape so a caller can bill a system-one call
  // through `computeTokensCostForUsageInMicroUsd` unchanged. System one has no
  // prompt cache, so the cache counters are always zero.
  usage: TokenUsageContent;
  metadata: EndpointMetadata;
};

/**
 * A model that answers named questions about a piece of state in one round
 * trip, rather than generating a message. Neither `StreamEndpoint` nor
 * `BatchEndpoint` fits: there is no conversation, no token stream and no job
 * lifecycle.
 */
export abstract class SystemOneEndpoint<
  C extends InputConfig = InputConfig,
> extends Client<C> {
  /**
   * @cc [owner:pmilliotte,label:error-handling] system-one-answer-never-throws
   * `answer` MUST resolve to an `Err` carrying normalized `ErrorContent` for every provider and
   * transport failure — rejected credentials, rate limits, timeouts, aborted requests, malformed
   * responses and client-side request validation alike — and MUST NOT reject.
   *
   * Call sites branch on the `Result` and have no second, throwing path to handle. An
   * implementation that lets a provider SDK exception escape turns a classified, attributable
   * failure into an unhandled rejection in whatever worker invoked it.
   */
  abstract answer<const Q extends Questions>(
    request: SystemOneRequest<Q>
  ): Promise<Result<SystemOneAnswer<Q>, ErrorContent>>;
}
