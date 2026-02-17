const PAGES_PROJECT = "app-dust-tt";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const branch = url.hostname.split(".preview.dust.tt")[0];

    if (!branch) {
      return new Response("Missing branch name in subdomain", {
        status: 400,
      });
    }

    // Rewrite to the CF Pages preview deployment for this branch.
    const pagesUrl = new URL(url);
    pagesUrl.hostname = `${branch}.${PAGES_PROJECT}.pages.dev`;

    // Forward the request, stripping the Host header so Pages sees
    // its own hostname.
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
