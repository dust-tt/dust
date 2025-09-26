import type { NextApiRequest, NextApiResponse } from "next";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB safety cap

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function stripMetaCSP(html: string): string {
  return html.replace(
    /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>\s*/gi,
    ""
  );
}

function ensureBaseHref(html: string, baseHref: string): string {
  // If there's already a <base>, keep it; otherwise inject one early in <head>.
  if (/<base\s/i.test(html)) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${baseHref}">`);
  }
  // Fallback: inject a head with base
  return `<!doctype html><html><head><base href="${baseHref}"></head><body>${html}</body></html>`;
}

function rewriteSrcSet(value: string, baseUrl: string): string {
  // srcset: "url1 1x, url2 2x" → rewrite each url
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(" ");
      const urlPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const descriptor = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx);
      try {
        const abs = new URL(urlPart, baseUrl).toString();
        return `/api/embed?url=${encodeURIComponent(abs)}${descriptor}`;
      } catch {
        return trimmed;
      }
    })
    .join(", ");
}

function rewriteResourceUrls(html: string, pageUrl: string): string {
  // Rewrite href/src/srcset attributes to proxy through /api/embed for cross-origin safety
  // Skip anchors, mailto, javascript, data URIs
  const skipProtocols = /^(#|mailto:|javascript:|data:|tel:)/i;

  // href/src
  html = html.replace(
    /(\s(?:src|href)\s*=\s*)(["'])([^"']+)(\2)/gi,
    (m, pre, quote, url, post) => {
      if (skipProtocols.test(url)) return m;
      try {
        const abs = new URL(url, pageUrl).toString();
        return `${pre}${quote}/api/embed?url=${encodeURIComponent(abs)}${quote}`;
      } catch {
        return m;
      }
    }
  );

  // srcset
  html = html.replace(
    /(\ssrcset\s*=\s*)(["'])([^"']+)(\2)/gi,
    (m, pre, quote, value) => {
      try {
        const rewritten = rewriteSrcSet(value, pageUrl);
        return `${pre}${quote}${rewritten}${quote}`;
      } catch {
        return m;
      }
    }
  );

  return html;
}

function sanitizeHtml(html: string, pageUrl: string): string {
  let out = html;
  out = stripMetaCSP(out);
  out = ensureBaseHref(out, new URL(pageUrl).origin + "/");
  out = rewriteResourceUrls(out, pageUrl);
  return out;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { url } = req.query;
  if (!url || typeof url !== "string" || !isHttpUrl(url)) {
    res.status(400).send("Invalid url parameter");
    return;
  }

  // Optional scale parameter to zoom the page (e.g., 0.85 to zoom out)
  const rawScale = Array.isArray(req.query.scale)
    ? req.query.scale[0]
    : (req.query.scale as string | undefined);
  let scale = 1;
  if (rawScale) {
    const n = Number(rawScale);
    if (!Number.isNaN(n)) {
      scale = Math.max(0.5, Math.min(1.25, n));
    }
  }

  try {
    const upstream = await fetch(url, {
      // Prevent credential forwarding
      redirect: "follow",
      headers: {
        "user-agent":
          req.headers["user-agent"]?.toString() ||
          "Mozilla/5.0 (compatible; DustEmbed/1.0; +https://dust.tt)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,*/*;q=0.5",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";
    // Non-HTML handling: stream bytes or process CSS to rewrite url(...) references
    if (!contentType.includes("text/html")) {
      // CSS: rewrite url(...) to proxy
      if (contentType.includes("text/css")) {
        let css = await upstream.text();
        if (css.length > MAX_BYTES) css = css.slice(0, MAX_BYTES);
        const baseUrl = url;
        css = css.replace(/url\(([^)]+)\)/gi, (m, p1) => {
          const raw = p1.trim().replace(/^['"]|['"]$/g, "");
          if (/^(data:|javascript:|#)/i.test(raw)) return m;
          try {
            const abs = new URL(raw, baseUrl).toString();
            return `url(/api/embed?url=${encodeURIComponent(abs)})`;
          } catch {
            return m;
          }
        });
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(css);
        return;
      }

      // Default: stream as-is
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=300");
      const reader = upstream.body?.getReader();
      if (!reader) {
        res.status(502).end();
        return;
      }
      let sent = 0;
      res.writeHead(200);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          sent += value.byteLength;
          if (sent > MAX_BYTES) {
            break;
          }
          res.write(Buffer.from(value));
        }
      }
      res.end();
      return;
    }

    // HTML: get text, strip CSP meta and ensure base
    let html = await upstream.text();
    if (html.length > MAX_BYTES) {
      html = html.slice(0, MAX_BYTES);
    }
    let sanitized = sanitizeHtml(html, url);
    if (scale !== 1) {
      const zoomStyle = `\n<style id="dust-embed-zoom">\n  html, body { height: auto !important; }\n  body {\n    transform: scale(${scale});\n    transform-origin: 0 0;\n    width: calc(100% / ${scale});\n  }\n</style>`;
      if (/<head[^>]*>/i.test(sanitized)) {
        sanitized = sanitized.replace(
          /<head[^>]*>/i,
          (m) => `${m}${zoomStyle}`
        );
      } else {
        sanitized = `${zoomStyle}${sanitized}`;
      }
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=120");
    // Do not set any X-Frame-Options header; sandboxing is applied by the client iframe.
    res.status(200).send(sanitized);
  } catch (e) {
    res.status(502).send("Failed to fetch upstream content");
  }
}
