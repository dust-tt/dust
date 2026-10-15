import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function sharedFileRequest(fileRef: string) {
  const params = new URLSearchParams({ fileRef });
  return new NextRequest(`http://viz/api/shared-files?${params.toString()}`, {
    headers: { Authorization: "Bearer token" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/shared-files", () => {
  it.each([
    { fileRef: "fil_ABCDEFGHIJ", path: "fil_ABCDEFGHIJ" },
    { fileRef: "project/sales q1.csv", path: "pod/sales%20q1.csv" },
    { fileRef: "./data.csv", path: "frame/data.csv" },
  ])(
    "relays $fileRef from front-api as an attachment",
    async ({ fileRef, path }) => {
      vi.stubEnv("DUST_FRONT_API", "http://front-api");
      const fetchUpstream = vi.fn(
        async () =>
          new Response("a,b", { headers: { "content-type": "text/csv" } })
      );
      vi.stubGlobal("fetch", fetchUpstream);

      const response = await GET(sharedFileRequest(fileRef));

      expect(fetchUpstream).toHaveBeenCalledExactlyOnceWith(
        `http://front-api/api/v1/viz/files/${path}`,
        { headers: { Authorization: "Bearer token" }, cache: "no-store" }
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("a,b");
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "content-disposition": "attachment",
        "content-type": "text/csv",
        "x-content-type-options": "nosniff",
      });
    }
  );

  it.each(["conversation-abc/../secrets.csv", "./../data.csv", "fil_short"])(
    "rejects %s without calling front-api",
    async (fileRef) => {
      const fetchUpstream = vi.fn();
      vi.stubGlobal("fetch", fetchUpstream);

      const response = await GET(sharedFileRequest(fileRef));

      expect(response.status).toBe(400);
      expect(fetchUpstream).not.toHaveBeenCalled();
    }
  );

  it("forwards the front-api error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("expired", { status: 401 }))
    );

    const response = await GET(sharedFileRequest("fil_ABCDEFGHIJ"));

    expect(response.status).toBe(401);
  });
});
