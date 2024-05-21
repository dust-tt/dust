import type {
  AgentActionSpecification,
  BaseActionRunParams,
  ProcessConfigurationType,
  Result,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import type {
  BaseActionConfigurationType,
  DustAppRunConfigurationType,
} from "@dust-tt/types";
import { BaseActionConfiguration } from "@dust-tt/types";

import { DustAppRunConfiguration } from "@app/lib/api/assistant/actions/dust_app_run";

// TEMPORARILY DEFINING THE CLASSES HERE
class ProcessConfiguration extends BaseActionConfiguration<ProcessConfigurationType> {
  constructor(t: ProcessConfigurationType) {
    super(t);
  }

  async buildSpecification(
    K: unknown,
    { name, description }: { name?: string; description?: string }
  ): Promise<Result<AgentActionSpecification, Error>> {
    console.log(K, name, description);
    throw new Error("Method not implemented.");
  }

  async *run(
    K: unknown,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown> {
    yield { K, runParams, customParams };
    throw new Error("Method not implemented.");
  }
}
class RetrievalConfiguration extends BaseActionConfiguration<RetrievalConfigurationType> {
  constructor(t: RetrievalConfigurationType) {
    super(t);
  }

  async buildSpecification(
    K: unknown,
    { name, description }: { name?: string; description?: string }
  ): Promise<Result<AgentActionSpecification, Error>> {
    console.log(K, name, description);
    throw new Error("Method not implemented.");
  }

  async *run(
    K: unknown,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown> {
    yield { K, runParams, customParams };
    throw new Error("Method not implemented.");
  }
}
class TablesQueryConfiguration extends BaseActionConfiguration<TablesQueryConfigurationType> {
  constructor(t: TablesQueryConfigurationType) {
    super(t);
  }

  async buildSpecification(
    K: unknown,
    { name, description }: { name?: string; description?: string }
  ): Promise<Result<AgentActionSpecification, Error>> {
    console.log(K, name, description);
    throw new Error("Method not implemented.");
  }

  async *run(
    K: unknown,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown> {
    yield { K, runParams, customParams };
    throw new Error("Method not implemented.");
  }
}

export const MAP_ACTION_TYPE_TO_CLASS = {
  dust_app_run_configuration: DustAppRunConfiguration,
  process_configuration: ProcessConfiguration,
  retrieval_configuration: RetrievalConfiguration,
  tables_query_configuration: TablesQueryConfiguration,
} as const satisfies Record<
  BaseActionConfigurationType,
  | { new (x: DustAppRunConfigurationType): DustAppRunConfiguration }
  | { new (x: ProcessConfigurationType): ProcessConfiguration }
  | { new (x: RetrievalConfigurationType): RetrievalConfiguration }
  | { new (x: TablesQueryConfigurationType): TablesQueryConfiguration }
>;
