// @vitest-environment node

import { XaiGrokFourDotSixGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_six_global_xai";
import { describe, expect, it } from "vitest";

describe("XaiStream", () => {
  it("disables SDK retries so the agent loop owns retry attempts", () => {
    const endpoint = new XaiGrokFourDotSixGlobalXaiStream({
      XAI_API_KEY: "test",
    });

    expect(Reflect.get(endpoint, "client")).toMatchObject({ maxRetries: 0 });
  });
});
