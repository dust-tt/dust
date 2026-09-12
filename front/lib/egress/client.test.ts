import {
  setBaseUrlResolver,
  setDefaultInitResolver,
} from "@app/lib/api/config";
import {
  clientEventSource,
  clientFetch,
  clientUpload,
} from "@app/lib/egress/client";
import type { EventSourcePolyfillInit } from "event-source-polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";

const eventSourceCalls: Array<{ url: string; init?: EventSourcePolyfillInit }> =
  [];

vi.mock("event-source-polyfill", () => ({
  EventSourcePolyfill: class {
    constructor(url: string, init?: EventSourcePolyfillInit) {
      eventSourceCalls.push({ url, init });
    }
  },
}));

type FakeXhr = {
  headers: Record<string, string>;
  method?: string;
  url?: string;
  withCredentials: boolean;
  upload: {
    onprogress?: (e: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
  };
  status: number;
  statusText: string;
  responseText: string;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open: (m: string, u: string) => void;
  setRequestHeader: (k: string, v: string) => void;
  send: (b: unknown) => void;
};

let last: FakeXhr;

function installFakeXhr(behavior: (xhr: FakeXhr) => void) {
  class Fake {
    headers: Record<string, string> = {};
    method?: string;
    url?: string;
    withCredentials = false;
    upload: FakeXhr["upload"] = {};
    status = 0;
    statusText = "";
    responseText = "";
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;
    onabort?: () => void;
    open(m: string, u: string) {
      this.method = m;
      this.url = u;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send() {
      setTimeout(() => {
        try {
          behavior(this as unknown as FakeXhr);
        } catch {
          // Swallowed the way the browser swallows a throwing event handler.
        }
      }, 0);
    }
  }
  vi.stubGlobal("XMLHttpRequest", function () {
    last = new Fake() as unknown as FakeXhr;
    return last;
  });
}

afterEach(() => {
  eventSourceCalls.length = 0;
  vi.unstubAllGlobals();
  setBaseUrlResolver(null);
  setDefaultInitResolver(null);
});

describe("clientUpload", () => {
  it("reports floored bytes-sent percentages and never 100 early", async () => {
    const seen: number[] = [];
    installFakeXhr((xhr) => {
      for (const loaded of [0, 333, 500, 999, 1000]) {
        xhr.upload.onprogress?.({
          lengthComputable: true,
          loaded,
          total: 1000,
        });
      }
      xhr.status = 200;
      xhr.responseText = JSON.stringify({ file: { sId: "fil_1" } });
      xhr.onload?.();
    });

    const res = await clientUpload("/api/w/w1/files/fil_1", new FormData(), {
      onProgress: (p) => seen.push(p),
    });

    expect(seen).toEqual([0, 33, 50, 99, 100]);
    expect(await res.json()).toEqual({ file: { sId: "fil_1" } });
    expect(res.ok).toBe(true);
  });

  it("skips progress when the total size is unknown", async () => {
    const seen: number[] = [];
    installFakeXhr((xhr) => {
      xhr.upload.onprogress?.({
        lengthComputable: false,
        loaded: 10,
        total: 0,
      });
      xhr.status = 200;
      xhr.responseText = "{}";
      xhr.onload?.();
    });

    await clientUpload("/x", new FormData(), {
      onProgress: (p) => seen.push(p),
    });

    expect(seen).toEqual([]);
  });

  it("rewrites the URL and applies the resolved auth context", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");
    setDefaultInitResolver(async () => ({
      credentials: "omit",
      headers: { Authorization: "Bearer tok" },
    }));
    installFakeXhr((xhr) => {
      xhr.status = 200;
      xhr.responseText = "{}";
      xhr.onload?.();
    });

    await clientUpload("/api/w/w1/files/fil_1", new FormData());

    expect(last.url).toBe("https://eu.dust.tt/api/w/w1/files/fil_1");
    expect(last.headers.authorization).toBe("Bearer tok");
    expect(last.withCredentials).toBe(false);
    expect(last.headers["content-type"]).toBeUndefined();
  });

  it("drops a Content-Type coming from the context defaults", async () => {
    // The browser has to derive `multipart/form-data` and its boundary from the `FormData` body;
    // an inherited `Content-Type` would replace it and break parsing server-side.
    setDefaultInitResolver(async () => ({
      headers: { "Content-Type": "application/json" },
    }));
    installFakeXhr((xhr) => {
      xhr.status = 200;
      xhr.responseText = "{}";
      xhr.onload?.();
    });

    await clientUpload("/api/w/w1/files/fil_1", new FormData());

    expect(last.headers["content-type"]).toBeUndefined();
  });

  it("sends cookies when no default init resolver is set in the SPA", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");
    installFakeXhr((xhr) => {
      xhr.status = 200;
      xhr.responseText = "{}";
      xhr.onload?.();
    });

    await clientUpload("/api/w/w1/files/fil_1", new FormData());

    expect(last.withCredentials).toBe(true);
  });

  it("rejects instead of hanging when the response cannot be represented", async () => {
    // `Response` throws on a status outside [200, 599]. Thrown from `onload`, that error escapes
    // the promise, so without an explicit guard the upload would stay pending forever.
    installFakeXhr((xhr) => {
      xhr.status = 700;
      xhr.responseText = "boom";
      xhr.onload?.();
    });

    await expect(clientUpload("/x", new FormData())).rejects.toThrow(
      "Upload returned a malformed response (status 700)"
    );
  });

  it("resolves error statuses and rejects transport failures", async () => {
    installFakeXhr((xhr) => {
      xhr.status = 500;
      xhr.responseText = JSON.stringify({ error: { message: "boom" } });
      xhr.onload?.();
    });
    const errorRes = await clientUpload("/x", new FormData());
    expect(errorRes.ok).toBe(false);
    expect(await errorRes.json()).toEqual({ error: { message: "boom" } });

    installFakeXhr((xhr) => xhr.onerror?.());
    await expect(clientUpload("/x", new FormData())).rejects.toThrow(
      "Network error while uploading."
    );
  });
});

// `clientUpload`, `clientFetch` and `clientEventSource` share one resolution point, so the SSE
// helper is covered here too: it must observe the same URL and auth context as the upload above.
describe("clientEventSource", () => {
  it("resolves the same URL and auth context as the other transports", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");
    setDefaultInitResolver(async () => ({
      credentials: "omit",
      headers: { Authorization: "Bearer tok" },
    }));

    await clientEventSource("/api/w/w1/events", {
      headers: { "X-Caller": "1" },
      heartbeatTimeout: 42,
    });

    expect(eventSourceCalls).toHaveLength(1);
    const [{ url, init }] = eventSourceCalls;
    expect(url).toBe("https://eu.dust.tt/api/w/w1/events");
    expect(init?.headers).toEqual({
      authorization: "Bearer tok",
      "x-caller": "1",
    });
    expect(init?.withCredentials).toBe(false);
    // Caller options unrelated to the auth context are preserved.
    expect(init?.heartbeatTimeout).toBe(42);
  });

  it("sends cookies when no default init resolver is set in the SPA", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");

    await clientEventSource("/api/w/w1/events");

    expect(eventSourceCalls[0].init?.withCredentials).toBe(true);
  });
});

// `clientFetch` carries every other client-side request in the app, so its three deployment
// contexts are pinned here: Next.js (same-origin), the SPA (cross-origin, cookies) and the browser
// extension (cross-origin, Bearer token).
describe("clientFetch", () => {
  function stubFetch(): Array<{ input: unknown; init?: RequestInit }> {
    const calls: Array<{ input: unknown; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response("{}", { status: 200 });
    });
    return calls;
  }

  it("leaves relative URLs and init untouched in the Next.js context", async () => {
    const calls = stubFetch();

    await clientFetch("/api/w/w1/files", { method: "POST", body: "x" });

    expect(calls[0].input).toBe("/api/w/w1/files");
    expect(calls[0].init).toEqual({ method: "POST", body: "x" });
  });

  it("rewrites the URL and sends cookies in the SPA context", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");
    const calls = stubFetch();

    await clientFetch("/api/w/w1/files");

    expect(calls[0].input).toBe("https://eu.dust.tt/api/w/w1/files");
    expect(calls[0].init?.credentials).toBe("include");
  });

  it("carries the Bearer token in the extension context", async () => {
    setBaseUrlResolver(() => "https://dust.tt");
    setDefaultInitResolver(async () => ({
      credentials: "omit",
      headers: { Authorization: "Bearer tok" },
    }));
    const calls = stubFetch();

    await clientFetch("/api/w/w1/files", { method: "POST" });

    expect(calls[0].input).toBe("https://dust.tt/api/w/w1/files");
    expect(calls[0].init?.credentials).toBe("omit");
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe(
      "Bearer tok"
    );
  });

  it("lets a caller override a default header regardless of its casing", async () => {
    setDefaultInitResolver(async () => ({
      headers: { Authorization: "Bearer default" },
    }));
    const calls = stubFetch();

    await clientFetch("/x", { headers: { authorization: "Bearer caller" } });

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer caller");
    // The default must not survive alongside the override under a different casing.
    expect(
      [...headers].filter(([name]) => name === "authorization")
    ).toHaveLength(1);
  });

  it("keeps caller headers passed as a Headers instance", async () => {
    setDefaultInitResolver(async () => ({
      headers: { Authorization: "Bearer tok" },
    }));
    const calls = stubFetch();

    await clientFetch("/x", {
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer tok");
  });

  it("does not rewrite non-string inputs", async () => {
    setBaseUrlResolver(() => "https://eu.dust.tt");
    const calls = stubFetch();
    const url = new URL("https://other.example/api");

    await clientFetch(url);

    expect(calls[0].input).toBe(url);
  });
});
