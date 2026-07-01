// A test/debug function that reports where the function process is running:
// the current working directory, the folder the bundle was loaded from, and the
// effective uid/gid (handy for verifying the privilege drop in the sandbox).
export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({
      cwd: process.cwd(),
      dir: import.meta.dir,
      uid: process.getuid?.() ?? null,
      gid: process.getgid?.() ?? null,
    });
  },
};
