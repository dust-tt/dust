import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import {
  GEMINI_3_7_FLASH_MODEL_CONFIG,
  GEMINI_3_8_FLASH_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import { describe, expect, it } from "vitest";

describe("user-facing model configs", () => {
  it("exposes Gemini 3.8 Flash as the latest Flash model", () => {
    expect(USED_MODEL_CONFIGS).toContain(GEMINI_3_8_FLASH_MODEL_CONFIG);
    expect(GEMINI_3_8_FLASH_MODEL_CONFIG.isLatest).toBe(true);
    expect(GEMINI_3_7_FLASH_MODEL_CONFIG.isLatest).toBe(false);
  });
});
