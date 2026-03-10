const PROJECTS = {
  app: "app-dust-tt",
  poke: "poke-dust-tt",
};

const WORKERS_SUBDOMAIN = "dust-account.workers.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Expected formats:
    //   branch--app.preview.dust.tt         → branch.app-dust-tt.pages.dev (Pages, legacy)
    //   branch--app-worker.preview.dust.tt  → branch-app-dust-tt.dust-account.workers.dev (Workers preview alias)
    const prefix = url.hostname.split(".preview.dust.tt")[0];
    const separatorIndex = prefix.lastIndexOf("--");

    if (separatorIndex === -1) {
      return new Response(
        "Expected format: <branch>--<app|poke|app-worker|poke-worker>.preview.dust.tt",
        { status: 400 }
      );
    }

    const branch = prefix.slice(0, separatorIndex);
    const target = prefix.slice(separatorIndex + 2);

    // Check if targeting Workers (suffix "-worker") or Pages (default)
    const isWorker = target.endsWith("-worker");
    const project = isWorker ? target.slice(0, -"-worker".length) : target;
    const projectName = PROJECTS[project];

    if (!projectName) {
      return new Response(`Unknown project: ${project}. Use "app" or "poke".`, {
        status: 400,
      });
    }

    const upstreamUrl = new URL(url);
    if (isWorker) {
      // Workers version preview alias: branch-app-dust-tt.dust-account.workers.dev
      upstreamUrl.hostname = `${branch}-${projectName}.${WORKERS_SUBDOMAIN}`;
    } else {
      upstreamUrl.hostname = `${branch}.${projectName}.pages.dev`;
    }

    const headers = new Headers(request.headers);
    headers.set("Host", upstreamUrl.hostname);

    return fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });
  },
};
