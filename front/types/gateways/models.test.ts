import { getStreamEndpoints } from "@app/lib/llms/stream";
import { EDGEE_HOST } from "@app/lib/model_constructors/types/hosts";
import { GATEWAY_MODEL_IDS } from "@app/types/gateways/models";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";
import { describe, expect, it } from "vitest";

describe("GATEWAY_MODEL_IDS", () => {
  it("lists exactly the models with an Edgee stream endpoint", () => {
    const edgeeEndpoints = getStreamEndpoints(
      {
        featureFlags: [...WHITELISTABLE_FEATURES],
        isEnterprise: true,
        isCreditPriced: true,
        isAdvancedModels: true,
      },
      { host: { eq: EDGEE_HOST } }
    );

    expect([...new Set(edgeeEndpoints.map((e) => e.model))].sort()).toEqual(
      [...GATEWAY_MODEL_IDS.edgee].sort()
    );
  });
});
