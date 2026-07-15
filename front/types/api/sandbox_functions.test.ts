import { describe, expect, it } from "vitest";
import { RUNNER_ERROR_CODES } from "../../../cli/dust-sandbox/functions-runner/protocol";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "./sandbox_functions";

describe("SANDBOX_FUNCTION_RUNNER_ERROR_CODES", () => {
  it("stays aligned with the runner protocol", () => {
    expect(SANDBOX_FUNCTION_RUNNER_ERROR_CODES).toEqual(RUNNER_ERROR_CODES);
  });
});
