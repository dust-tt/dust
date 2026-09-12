import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import { SandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { describe, expect, it, vi } from "vitest";

describe("sandbox function data APIs", () => {
  it("loads workspace-scoped identity over RPC", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
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
      isWorkspaceMember: true,
      user: { sId: "usr_123" },
    });
    expect(sendMessage).toHaveBeenCalledWith("getUserIdentity", null);
  });

  it("defaults pod editorship to false for hosts that omit it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
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
      isPodEditor: false,
    });
  });

  it("keeps pod editorship from hosts that provide it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isPodEditor: true,
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
      isPodEditor: true,
    });
  });

  it("defaults pod membership to false for hosts that omit it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
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
      isPodMember: false,
    });
  });

  it("keeps pod membership from hosts that provide it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isPodMember: true,
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
      isPodMember: true,
    });
  });

  it("defaults Frame authorship to false for hosts that omit it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
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
      isFrameAuthor: false,
    });
  });

  it("keeps Frame authorship from hosts that provide it", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isFrameAuthor: true,
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
      isFrameAuthor: true,
    });
  });

  it("returns no identity from the public cache", async () => {
    const api = new CacheDataAPI();

    await expect(api.getUserIdentity()).resolves.toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      isFrameAuthor: false,
      isPodEditor: false,
      isPodMember: false,
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

describe("host liveness", () => {
  it("pings the host when constructed with a host window", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const api = new RPCDataAPI(sendMessage, { hasHostWindow: true });

    expect(sendMessage).toHaveBeenCalledWith("ping", null);
    await vi.waitFor(() => expect(api.hostLiveness).toBe("alive"));
  });

  it("records an unanswered ping without changing call behavior", async () => {
    const sendMessage = vi.fn().mockImplementation(async (command: string) => {
      if (command === "ping") {
        throw new Error("Frame host did not answer the liveness ping.");
      }
      return [{ id: 1 }];
    });
    const api = new RPCDataAPI(sendMessage, { hasHostWindow: true });

    await vi.waitFor(() => expect(api.hostLiveness).toBe("unresponsive"));
    // Silent embedded hosts are treated as legacy: calls still go over RPC.
    await expect(api.callFunction("pod/function")).resolves.toEqual([
      { id: 1 },
    ]);
  });

  it("fails calls fast without a host window instead of hanging", async () => {
    const sendMessage = vi.fn();
    const api = new RPCDataAPI(sendMessage, { hasHostWindow: false });

    const promise = api.callFunction("pod/function");

    await expect(promise).rejects.toBeInstanceOf(SandboxFunctionCallError);
    await expect(promise).rejects.toMatchObject({ code: "not_supported" });
    // No ping and no call ever leave a hostless window.
    expect(sendMessage).not.toHaveBeenCalled();
    expect(api.hostLiveness).toBe("unresponsive");
  });

  it("keeps non-call reads on the RPC channel without a host window", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ code: "<Frame />" });
    const api = new RPCDataAPI(sendMessage, { hasHostWindow: false });

    // Reads keep their own error handling; only callFunction fails fast.
    await expect(api.fetchCode()).resolves.toBe("<Frame />");
    expect(sendMessage).toHaveBeenCalledWith("getCodeToExecute", null);
  });
});
