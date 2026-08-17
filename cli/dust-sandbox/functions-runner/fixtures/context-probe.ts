// Reads the invocation environment through @dust/pod's accessor, imported
// from the pod package source directly. In tests this exercises the real
// cross-module-graph contract: this fixture's copy of the context module and
// the runner's own (functions-runner/context.ts) only share state through the
// Symbol.for registry, exactly like the vendored @dust/pod does in the
// sandbox. An optional delayMs query param spans the reads across an await so
// tests can prove concurrent invocations do not leak into each other.
import { podEnv } from "../../pod/context.ts";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const delayMs = Number(url.searchParams.get("delayMs") ?? "0");
    const before = podEnv("WARM_TEST_MARKER") ?? null;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const after = podEnv("WARM_TEST_MARKER") ?? null;
    return Response.json({
      before,
      after,
      identity: podEnv("DUST_POD_USER_IDENTITY") ?? null,
    });
  },
};
