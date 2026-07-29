import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import { SandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { describe, expect, it, vi } from "vitest";

describe("sandbox function data APIs", () => {
  it("loads workspace-scoped identity over RPC", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      user: {
        sId: "usr_123",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        image: null,
      },
    });
    const api = new RPCDataAPI(sendMessage);

    await expect(api.getUserIdentity()).resolves.toMatchObject({
      isAuthenticated: true,
      user: { sId: "usr_123" },
    });
    expect(sendMessage).toHaveBeenCalledWith("getUserIdentity", null);
  });

  it("returns no identity from the public cache", async () => {
    const api = new CacheDataAPI();

    await expect(api.getUserIdentity()).resolves.toEqual({
      isAuthenticated: false,
      user: null,
    });
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

  it("forwards a code viz does not know about instead of relabelling it", async () => {
    const api = new RPCDataAPI(async () => {
      throw {
        code: "sandbox_function_not_found",
        message: "Sandbox function not found.",
        status: 404,
      };
    });

    await expect(api.callFunction("pod/function")).rejects.toMatchObject({
      code: "sandbox_function_not_found",
      status: 404,
    });
  });

  it("falls back to transport_error when the payload is not a call error", async () => {
    const api = new RPCDataAPI(async () => {
      throw new Error("The iframe channel closed.");
    });

    await expect(api.callFunction("pod/function")).rejects.toMatchObject({
      code: "transport_error",
      message: "The iframe channel closed.",
    });
  });

  it("rejects calls from public frames as unsupported", async () => {
    const api = new CacheDataAPI();

    await expect(api.callFunction("pod/function")).rejects.toMatchObject({
      code: "not_supported",
    });
  });
});
