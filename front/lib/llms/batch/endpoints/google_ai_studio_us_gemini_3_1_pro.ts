import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioUsGeminiThreeDotOneProBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_1_pro";

export class DustGoogleAiStudioUsGeminiThreeDotOneProBatch extends GoogleAiStudioUsGeminiThreeDotOneProBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioUsGeminiThreeDotOneProBatch);
