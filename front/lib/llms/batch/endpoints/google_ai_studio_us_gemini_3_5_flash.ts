import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioUsGeminiThreeDotFiveFlashBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_5_flash";

export class DustGoogleAiStudioUsGeminiThreeDotFiveFlashBatch extends GoogleAiStudioUsGeminiThreeDotFiveFlashBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioUsGeminiThreeDotFiveFlashBatch);
