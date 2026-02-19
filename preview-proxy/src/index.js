const PROJECTS = {
  app: "app-dust-tt",
  poke: "poke-dust-tt",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Expected formats:
    //   branch--app.preview.dust.tt  → branch.app-dust-tt.pages.dev
    //   branch--poke.preview.dust.tt → branch.poke-dust-tt.pages.dev
    const prefix = url.hostname.split(".preview.dust.tt")[0];
    const separatorIndex = prefix.lastIndexOf("--");

    if (separatorIndex === -1) {
      return new Response(
        "Expected format: <branch>--<app|poke>.preview.dust.tt",
        { status: 400 }
      );
    }

    const branch = prefix.slice(0, separatorIndex);
    const project = prefix.slice(separatorIndex + 2);
    const pagesProject = PROJECTS[project];

    if (!pagesProject) {
      return new Response(`Unknown project: ${project}. Use "app" or "poke".`, {
        status: 400,
      });
    }

    const pagesUrl = new URL(url);
    pagesUrl.hostname = `${branch}.${pagesProject}.pages.dev`;

    const headers = new Headers(request.headers);
    headers.set("Host", pagesUrl.hostname);

    return fetch(pagesUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });
  },
};
