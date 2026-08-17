import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Creates a file the way a function body would (no explicit mode) and reports
// the resulting permission bits, so the runner's umask can be asserted.
export default {
  async fetch(): Promise<Response> {
    const dir = mkdtempSync(join(tmpdir(), "dsbx-mode-"));
    const path = join(dir, "probe.db");
    await Bun.write(path, "");
    return Response.json({ mode: statSync(path).mode & 0o777 });
  },
};
