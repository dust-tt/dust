const PROJECTS = {
  app: "app-dust-tt",
  poke: "poke-dust-tt",
};

const WORKERS_SUBDOMAIN = "dust-account.workers.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Expected formats:
    //   branch--app.preview.dust.tt  → app-dust-tt-preview-branch.dust-account.workers.dev
    //   branch--poke.preview.dust.tt → poke-dust-tt-preview-branch.dust-account.workers.dev
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
    const workersProject = PROJECTS[project];

    if (!workersProject) {
      return new Response(`Unknown project: ${project}. Use "app" or "poke".`, {
        status: 400,
      });
    }

    const workersUrl = new URL(url);
    workersUrl.hostname = `${workersProject}-preview-${branch}.${WORKERS_SUBDOMAIN}`;

    const headers = new Headers(request.headers);
    headers.set("Host", workersUrl.hostname);

    return fetch(workersUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });
  },
};
