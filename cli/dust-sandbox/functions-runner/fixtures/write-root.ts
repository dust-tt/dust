// A probe function for the privilege drop: it tries to write /hello.txt at the
// filesystem root. Run as root it succeeds; dropped to the unprivileged agent
// uid it should fail with EACCES.
import { writeFileSync } from "node:fs";

export default {
  async fetch(_req: Request): Promise<Response> {
    try {
      writeFileSync("/hello.txt", "hello\n");
      return Response.json({ wrote: true, path: "/hello.txt" });
    } catch (e) {
      return Response.json({
        wrote: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
};
