# SPA Preview Proxy

Cloudflare Worker that proxies `<branch>.preview.dust.tt` to the corresponding Cloudflare Pages preview deployment at `<branch>.app-dust-tt.pages.dev`.

This allows testing SPA branches on a `.dust.tt` subdomain so that cookies (auth, sessions) are sent to the API.

## How it works

```
Browser → my-branch.preview.dust.tt → CF Worker → my-branch.app-dust-tt.pages.dev
                                          ↑
                                cookies on .dust.tt are sent ✅
```

The `*.preview.dust.tt` DNS record and Zero Trust access policy are managed in `dust-infra` (Terraform). The Worker is deployed separately via Wrangler.

## Deploy

```bash
npm install
npx wrangler login   # one-time
npx wrangler deploy
```

## Local dev

```bash
npx wrangler dev
```
