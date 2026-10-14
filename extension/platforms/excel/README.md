# Dust Excel add-in

The add-in is a web app. Excel shows it in a task pane. The manifest
(`manifest.xml`) gives the URL of the web app: `https://localhost:3014/excel/taskpane.html`.

## Certificates

Excel desktop runs the task pane in a WebView, which rejects a certificate that the system does not
trust. Install the Office development certificates once. The command asks for your password, as it
adds its CA to the keychain:

```sh
npx office-addin-dev-certs install
```

The dev server picks them up from `~/.office-addin-dev-certs`. Without them it falls back to a
self-signed certificate, which only Excel on the web accepts, after the browser warning.

## Start the dev server

```sh
cd extension
npm run dev:excel
```

## Dust URLs in development

The task pane uses HTTPS, and WebKit refuses a plain-HTTP request from an HTTPS page. Excel
therefore cannot call the local Dust on `http://localhost:3000`. `.env.development.excel` points
the Dust URLs at the add-in origin (`https://localhost:3014`), and the dev server proxies `/api` to
the local Dust. `.env.development` gives every other variable. Production builds use
`.env.production`.

## Install the manifest

When the add-in is installed, the **Dust (dev)** button is on the **Home** tab. Click the
button to open the task pane.

### Excel on the web

1. Open a workbook on `https://excel.cloud.microsoft`.
2. Select **Home** > **Add-ins** > **Advanced**.
3. Select **Upload My Add-in**.
4. Select `manifest.xml`. Click **Upload**.

## Sign-in

The task pane makes a PKCE pair and opens an Office dialog on `auth.html`. On the first visit,
this page goes to `/api/workos/login` with `redirect_uri=<add-in origin>/excel/auth.html`. After
sign-in, WorkOS goes back to `auth.html` with `code` (or `error`). On this second visit, the page
loads Office.js and sends the code to the task pane, which gets the tokens from
`/api/workos/authenticate`. The tokens are in `localStorage`.
