import type { KnownModelLLMId } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import type { StaticModelIdType } from "./models";

// Compile-time guard: every entry in `STATIC_MODEL_IDS` (front) must also be
// declared in `KnownModelLLMId` (sdks/js/src/types.ts). If `tsgo` fails on the
// line below, the failing type names the drifted model id(s) directly: add
// them to the `KnownModelLLMId` union in sdks/js/src/types.ts. External SDK
// consumers rely on that union for autocomplete and type narrowing;
// out-of-sync ids cause drift like dust-tt/tasks#8200.
//
// The check is intentionally one-directional (front ⊆ SDK). The SDK union is
// a loose superset that keeps deprecated ids around for backwards compat with
// stored agents (e.g. `accounts/fireworks/models/kimi-k2-instruct`), so a
// symmetric check would false-positive. `CUSTOM_MODEL_IDS` (GCS-generated at
// build time) are dynamic by design and not covered here.
//
// Lives in a `.test.ts` file because the SDK is the public API contract and
// front internals are otherwise not allowed to import from `@dust-tt/client`
// (enforced by `.grit/patterns/enforceClientTypesInPublicApi.grit`). Test
// files are exempt, and `tsgo` still typechecks them in CI.
type _SdkModelIdDrift = Exclude<StaticModelIdType, KnownModelLLMId>;
const _assertNoSdkModelIdDrift: [_SdkModelIdDrift] extends [never]
  ? true
  : _SdkModelIdDrift = true;

describe("STATIC_MODEL_IDS vs SDK KnownModelLLMId", () => {
  it("compiles (drift is caught at typecheck time, see assertion above)", () => {
    expect(_assertNoSdkModelIdDrift).toBe(true);
  });
});
