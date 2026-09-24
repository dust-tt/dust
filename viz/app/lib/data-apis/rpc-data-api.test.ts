import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import { HybridDataAPI } from "@viz/app/lib/data-apis/hybrid-data-api";
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

const fileEdit = {
  path: "./notes.json",
  content: "{}",
  revision: '\"123\"',
};

describe("revision-aware file access", () => {
  it("returns file contents and their revision in a separate snapshot", async () => {
    const api = new RPCDataAPI(
      vi.fn().mockResolvedValue({
        fileBlob: new Blob(['{"text":"hello"}'], { type: "application/json" }),
        revision: '\"123\"',
        canWrite: true,
      })
    );
    const file = await api.fetchFile("./notes.json");
    expect(file?.file).toBeInstanceOf(File);
    expect(file?.file).not.toHaveProperty("revision");
    expect(file?.file).not.toHaveProperty("canWrite");
    expect(await file?.file.text()).toBe('{"text":"hello"}');
    expect(file).toMatchObject({
      file: expect.objectContaining({ name: "./notes.json" }),
      revision: '\"123\"',
      canWrite: true,
    });
  });

  it("accepts the old getFile response and disables writes without metadata", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ fileBlob: new Blob(["old host"]) });
    const api = new RPCDataAPI(sendMessage);
    const file = await api.fetchFile("./notes.txt");
    expect(await file?.file.text()).toBe("old host");
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith("getFile", {
      fileId: "./notes.txt",
    });
    expect(file).toMatchObject({ revision: null, canWrite: false });
  });

  it("returns save conflicts without retrying or treating them as success", async () => {
    const result = {
      success: false,
      error: { code: "conflict", message: "Reload before saving." },
    };
    const sendMessage = vi.fn().mockResolvedValue(result);
    const api = new RPCDataAPI(sendMessage);
    await expect(api.writeFile(fileEdit)).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith("writeFile", fileEdit);
  });

  it("returns an unconfirmed save when the transport times out", async () => {
    const api = new RPCDataAPI(
      vi.fn().mockRejectedValue(new Error("Timed out"))
    );
    await expect(api.writeFile(fileEdit)).resolves.toMatchObject({
      success: false,
      error: { code: "save_failed" },
    });
  });

  it("reads fresh files and revisions before and after a shared-view write", async () => {
    const cache = new CacheDataAPI(
      [
        {
          fileId: "./notes.json",
          data: btoa("Cached content"),
          mimeType: "application/json",
        },
      ],
      "Published code"
    );
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        fileBlob: new Blob(["Current content"]),
        revision: "123",
        canWrite: true,
      })
      .mockResolvedValueOnce({ success: true, revision: "124" })
      .mockResolvedValueOnce({
        fileBlob: new Blob(["Updated content"]),
        revision: "124",
        canWrite: true,
      });
    const api = new HybridDataAPI(cache, new RPCDataAPI(sendMessage));
    const file = await api.fetchFile("./notes.json");
    expect(await file?.file.text()).toBe("Current content");
    expect(file).toMatchObject({ revision: "123", canWrite: true });

    const edit = { ...fileEdit, content: "Updated content", revision: "123" };
    await expect(api.writeFile(edit)).resolves.toEqual({
      success: true,
      revision: "124",
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, "writeFile", edit);

    const updated = await api.fetchFile("./notes.json");
    expect(await updated?.file.text()).toBe("Updated content");
    expect(updated).toMatchObject({ revision: "124", canWrite: true });
    await expect(api.fetchCode()).resolves.toBe("Published code");
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("keeps the shared snapshot readable when source access is denied", async () => {
    const cache = new CacheDataAPI([
      {
        fileId: "./notes.json",
        data: btoa("{}"),
        mimeType: "application/json",
      },
    ]);
    const denied = {
      success: false,
      error: { code: "read_only", message: "You cannot edit this file." },
    };
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ fileBlob: null })
      .mockResolvedValueOnce(denied);
    const api = new HybridDataAPI(cache, new RPCDataAPI(sendMessage));
    const file = await api.fetchFile("./notes.json");
    expect(await file?.file.text()).toBe("{}");
    expect(file).toMatchObject({ revision: null, canWrite: false });
    await expect(api.writeFile(fileEdit)).resolves.toEqual(denied);
    expect(sendMessage).toHaveBeenNthCalledWith(1, "getFile", {
      fileId: "./notes.json",
    });
  });
});
