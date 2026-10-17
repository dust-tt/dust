import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { OpenAIDecisionsSystemOne } from "@app/lib/model_constructors/system_one/clients/openai_decisions";
import type { SystemOneEndpointConstructor } from "@app/lib/model_constructors/system_one/configuration";
import { GPT_6_LUNA } from "@app/lib/model_constructors/types/models";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne extends OpenAIDecisionsSystemOne {
  static readonly model = GPT_6_LUNA;

  // Verified 2026-10-14: https://developers.openai.com/api/docs/guides/decisions
  static readonly tokenPricing = {
    standardInput: 0.1,
    standardOutput: 0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne satisfies SystemOneEndpointConstructor;
