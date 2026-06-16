/**
 * Worker for the main app SPA.
 *
 * Static assets (JS, CSS, images) are served directly by the Workers Static
 * Assets layer. This worker is NOT invoked for those requests.
 *
 * This worker only runs when no static file matched the request path
 * (not_found_handling = "none" in wrangler config). Its job is to:
 *
 * 1. Return 404 for missing assets under /assets/ (prevent SPA fallback
 *    from serving index.html with a 200 for broken JS/CSS imports).
 *
 * 2. Route sub-app paths to their dedicated index.html:
 *    - /share/*                → share/index.html
 *    - /oauth/*, /w/* /oauth/* → oauth/index.html
 *    - /email/*                → email/index.html
 *
 * 3. For /share/frame/:token, inject Open Graph meta tags into the HTML
 *    by fetching frame metadata from the API before serving.
 *
 * 4. Fall back to the main index.html for all other paths (SPA routing).
 */

import type { GetShareFrameMetadataResponseBody } from "@dust-tt/front/lib/api/files/share";
import { z } from "zod";

interface Env {
  ASSETS: Fetcher;
  DUST_API_URL: string;
}

// z.ZodType<Pick<...>> makes TS flag any drift with GetShareFrameMetadataResponseBody.
const ShareFrameMetadataSchema: z.ZodType<
  Pick<
    GetShareFrameMetadataResponseBody,
    "title" | "workspaceName" | "ogImageUrl"
  >
> = z.object({
  title: z.string(),
  workspaceName: z.string(),
  ogImageUrl: z.string().nullable(),
});

type ShareFrameMetadata = z.infer<typeof ShareFrameMetadataSchema>;

const RegionRedirectErrorSchema = z.object({
  error: z.object({
    type: z.literal("workspace_in_different_region"),
    redirect: z.object({
      region: z.string(),
      url: z.string(),
    }),
  }),
});

const SHARE_FRAME_RE = /^\/share\/frame\/([^/]+)$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOgMetaTags(
  meta: ShareFrameMetadata,
  canonicalUrl: string,
  fallbackImageUrl: string
): string {
  const title = `${meta.title} - ${meta.workspaceName}`;
  const description = `Discover what ${meta.workspaceName} built with AI. Explore now.`;
  const image = meta.ogImageUrl ?? fallbackImageUrl;

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Dust">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escapeHtml(`Preview of ${meta.title} created by ${meta.workspaceName}`)}">`,
  ].join("\n    ");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/assets/")) {
      return new Response("Not Found", { status: 404 });
    }

    let fallback: string;
    if (path === "/share" || path.startsWith("/share/")) {
      fallback = "/share/index.html";
    } else if (
      path === "/oauth" ||
      path.startsWith("/oauth/") ||
      /^\/w\/[^/]+\/oauth(\/|$)/.test(path)
    ) {
      fallback = "/oauth/index.html";
    } else if (path === "/email" || path.startsWith("/email/")) {
      fallback = "/email/index.html";
    } else {
      fallback = "/index.html";
    }

    const htmlResponse = env.ASSETS.fetch(new URL(fallback, url.origin));

    const frameMatch = SHARE_FRAME_RE.exec(path);
    if (frameMatch) {
      const token = frameMatch[1];
      return injectFrameOgTags(
        await htmlResponse,
        token,
        url.href,
        env.DUST_API_URL
      );
    }

    return htmlResponse;
  },
};

async function fetchFrameMeta(
  token: string,
  apiBaseUrl: string
): Promise<ShareFrameMetadata | null> {
  const res = await fetch(`${apiBaseUrl}/api/share/frame/${token}`);

  if (res.ok) {
    const parsed = ShareFrameMetadataSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  }

  // The frame may live in a different region; follow the redirect hint.
  if (res.status === 400) {
    const parsed = RegionRedirectErrorSchema.safeParse(await res.json());
    if (parsed.success) {
      const regionRes = await fetch(
        `${parsed.data.error.redirect.url}/api/share/frame/${token}`
      );
      if (regionRes.ok) {
        const regionParsed = ShareFrameMetadataSchema.safeParse(
          await regionRes.json()
        );
        return regionParsed.success ? regionParsed.data : null;
      }
    }
  }

  return null;
}

async function injectFrameOgTags(
  htmlResponse: Response,
  token: string,
  canonicalUrl: string,
  apiBaseUrl: string
): Promise<Response> {
  let meta: ShareFrameMetadata | null;
  try {
    meta = await fetchFrameMeta(token, apiBaseUrl);
  } catch {
    return htmlResponse;
  }

  if (!meta) {
    return htmlResponse;
  }

  const fallbackImageUrl = `${apiBaseUrl}/static/og/ic.png`;
  const ogTags = buildOgMetaTags(meta, canonicalUrl, fallbackImageUrl);

  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.prepend(ogTags, { html: true });
      },
    })
    .transform(htmlResponse);
}
