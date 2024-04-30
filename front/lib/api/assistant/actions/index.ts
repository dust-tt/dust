import type { ModelId, ModelMessageType } from "@dust-tt/types";

export interface GenerateSpecificationParams {
  name?: string;
  description?: string;
}

export abstract class Action {
  constructor(readonly id: ModelId, readonly type: string) {}

  abstract renderForModel(): ModelMessageType;

  // abstract generateSpecification(
  //   auth: Authenticator,
  //   params: GenerateSpecificationParams
  // ): Promise<Result<AgentActionSpecification, Error>>;

  // abstract run(): IterableIterator<unknown>;
}
