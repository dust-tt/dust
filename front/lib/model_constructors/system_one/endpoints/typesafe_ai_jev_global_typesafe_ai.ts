import { WithJevConfig } from "@app/lib/model_constructors/providers/typesafe_ai/models/jev";
import { TypeSafeAiSystemOne } from "@app/lib/model_constructors/system_one/clients/typesafe_ai";
import type { SystemOneEndpointConstructor } from "@app/lib/model_constructors/system_one/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class TypesafeAiJevGlobalTypesafeAiSystemOne extends WithJevConfig(
  TypeSafeAiSystemOne
) {
  // TODO(2026-09-20 pierre): confirm against TypeSafe's published pricing and
  // replace. Billing does not read this yet (see the note on `TokenPricing`).
  static readonly tokenPricing = {
    standardInput: 0,
    standardOutput: 0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

TypesafeAiJevGlobalTypesafeAiSystemOne satisfies SystemOneEndpointConstructor;
