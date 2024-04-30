import type { ActionBase, ModelId, ModelMessageType } from "@dust-tt/types";

export interface GenerateSpecificationParams {
  name?: string;
  description?: string;
}

export abstract class Action implements ActionBase {
  // TODO(2024-04-30 flav) Remove the hardcoded value for type.
  constructor(readonly id: ModelId, readonly type: "dust_app_run_action") {}

  abstract renderForModel(): ModelMessageType;

  // abstract generateSpecification(
  //   auth: Authenticator,
  //   params: GenerateSpecificationParams
  // ): Promise<Result<AgentActionSpecification, Error>>;

  // abstract run(): IterableIterator<unknown>;
}
