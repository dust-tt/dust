import { readFileSync } from "node:fs";
import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import {
  SANDBOX_FUNCTION_CALL_ERROR_CODES,
  SandboxFunctionCallError,
} from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { describe, expect, it } from "vitest";

function extractStringArray(source: string, constantName: string): string[] {
  const match = source.match(
    new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const;`)
  );
  if (!match?.[1]) {
    throw new Error(`Could not find ${constantName}.`);
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g), ([, value]) => value);
}

describe("sandbox function data APIs", () => {
  it("keeps Frame error codes aligned with front", () => {
    const runnerSource = readFileSync(
      new URL(
        "../../../../cli/dust-sandbox/functions-runner/protocol.ts",
        import.meta.url
      ),
      "utf8"
    );
    const frontSource = readFileSync(
      new URL(
        "../../../../front/types/api/sandbox_functions.ts",
        import.meta.url
      ),
      "utf8"
    );
    const frontCodes = [
      ...extractStringArray(runnerSource, "RUNNER_ERROR_CODES"),
      ...extractStringArray(frontSource, "SANDBOX_FUNCTION_CALL_ERROR_CODES"),
    ];

    expect(SANDBOX_FUNCTION_CALL_ERROR_CODES).toEqual(frontCodes);
  });

  it("rejects RPC calls with a typed sandbox function error", async () => {
    const api = new RPCDataAPI(async () => {
      throw {
        code: "invalid_output",
        message: "Function output does not match schema.output.",
      };
    });

    const promise = api.callFunction("pod/function");

    await expect(promise).rejects.toBeInstanceOf(SandboxFunctionCallError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects calls from public frames as unsupported", async () => {
    const api = new CacheDataAPI();

    await expect(api.callFunction("pod/function")).rejects.toMatchObject({
      code: "not_supported",
    });
  });
});
