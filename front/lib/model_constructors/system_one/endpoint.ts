import { Client } from "@app/lib/model_constructors/client";
import type {
  DecisionOptions,
  DecisionRequest,
} from "@app/lib/model_constructors/types/input/decisions";
import type { DecisionResult } from "@app/lib/model_constructors/types/output/decisions";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import type { Result } from "@app/types/shared/result";

export abstract class SystemOneEndpoint extends Client {
  /**
   * @cc [owner:pmilliotte,label:error-handling] decide-returns-one-answer-per-question
   * `decide` MUST NOT throw on provider, transport or abort failures: they are returned as an
   * `Err` error event. An `Ok` result MUST hold exactly one answer per requested question, with
   * the question's `name` and `type`; a provider refusal or a missing or mismatched answer is an
   * `Err`, never a partial `Ok`.
   */
  abstract decide(
    request: DecisionRequest,
    options?: DecisionOptions
  ): Promise<Result<DecisionResult, ErrorEvent>>;
}
