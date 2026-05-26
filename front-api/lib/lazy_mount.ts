import logger from "@app/logger/logger";
import { Hono } from "hono";

// The loader may return any Hono variant — different sub-apps in this server
// have different `Variables` types (SessionCtx, WorkspaceAwareCtx, ...). Once
// loaded we only call `.fetch()` on it, which is uniform across variants.
type AnyHono = Hono<any, any, any>;
type Loader = () => Promise<AnyHono>;

// Strip the trailing colon-prefixed segment from a path pattern (if any).
// "/w/:wId" -> "/w"; "/foo" -> "/foo". Used to find the literal portion of a
// mount prefix that should be removed from the request URL before forwarding
// to a lazily-loaded sub-app.
function literalPrefix(prefix: string): string {
  const idx = prefix.indexOf("/:");
  return idx === -1 ? prefix : prefix.slice(0, idx);
}

function paramSegment(prefix: string): string | null {
  const idx = prefix.indexOf("/:");
  return idx === -1 ? null : prefix.slice(idx);
}

/**
 * Lazily mount a Hono sub-app at `prefix` on `parent`. The sub-app module is
 * imported on the first request matching `prefix` (or `prefix/*`) and cached
 * thereafter.
 *
 * `parentMountPath` is the path at which `parent` itself is mounted on the
 * top-level server (e.g. "/api"). It is stripped from the inbound URL before
 * forwarding so the sub-app sees paths starting from its own root, matching
 * what `parent.route(prefix, subApp)` would have produced.
 *
 * `prefix` may include a single trailing path param (e.g. "/w/:wId"). In that
 * case the loaded sub-app is wrapped so its routes are re-prefixed with the
 * param segment, preserving `c.req.param("wId")` in inner middleware.
 */
export function lazyMount(
  parent: AnyHono,
  parentMountPath: string,
  prefix: string,
  loader: Loader
): void {
  let loaded: AnyHono | undefined;
  let loading: Promise<void> | undefined;

  const param = paramSegment(prefix);
  const fullLiteralStrip = parentMountPath + literalPrefix(prefix);

  const ensureLoaded = async (): Promise<AnyHono> => {
    if (loaded) {
      return loaded;
    }
    loading ??= (async () => {
      const startMs = performance.now();
      const inner = await loader();
      if (param) {
        const wrapper = new Hono();
        wrapper.route(param, inner);
        loaded = wrapper;
      } else {
        loaded = inner;
      }
      const durationMs = Math.round(performance.now() - startMs);
      logger.info(
        { prefix, durationMs },
        "[lazy-mount] loaded sub-app on first request"
      );
    })();
    await loading;
    return loaded!;
  };

  const handle = async (c: { req: { url: string; raw: Request } }) => {
    const app = await ensureLoaded();
    const url = new URL(c.req.url);
    url.pathname = url.pathname.slice(fullLiteralStrip.length) || "/";
    return app.fetch(new Request(url, c.req.raw));
  };

  parent.all(prefix, handle as never);
  parent.all(`${prefix}/*`, handle as never);
}
