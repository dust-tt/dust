import {
  buildPostHogDownstreamHeaders,
  buildPostHogUpstreamHeaders,
  resolvePostHogUpstreamUrl,
} from "@marketing/lib/posthog_proxy";
import logger from "@marketing/logger/logger";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const config = {
  api: {
    bodyParser: false,
  },
};

function toWebStream(readable: Readable): ReadableStream<Uint8Array> {
  const iterator = readable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

// oxlint-disable-next-line dust/nextjsPageComponentNaming -- API route
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const method = req.method ?? "GET";
  const upstreamUrl = resolvePostHogUpstreamUrl(
    new URL(req.url ?? "/", "http://localhost")
  );
  const headers = buildPostHogUpstreamHeaders(req.headers);
  const init: RequestInit & { duplex?: "half" } =
    method === "GET" || method === "HEAD"
      ? { method, headers }
      : { method, headers, body: toWebStream(req), duplex: "half" };

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (error) {
    logger.warn(
      { upstreamUrl, method, error },
      "PostHog proxy upstream fetch failed"
    );
    return res
      .status(502)
      .json({ error: "PostHog proxy upstream fetch failed" });
  }

  res.status(upstream.status);
  for (const [name, value] of buildPostHogDownstreamHeaders(upstream.headers)) {
    res.setHeader(name, value);
  }
  if (!upstream.body) {
    return res.end();
  }

  try {
    await pipeline(upstream.body, res);
  } catch (error) {
    logger.warn(
      { upstreamUrl, method, error },
      "PostHog proxy upstream stream failed"
    );
    res.destroy();
  }
}
