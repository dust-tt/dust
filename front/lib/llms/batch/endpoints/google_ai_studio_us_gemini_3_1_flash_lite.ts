import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_1_flash_lite";

export class DustGoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch extends GoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch);
