# Dust Excel add-in

The add-in is a web app. Excel shows it in a task pane. The manifest
(`manifest.dev.xml`) gives the URL of the web app: `https://localhost:3014/taskpane.html`.

## Start the dev server

```sh
cd extension
npm run dev:excel
```

## Install the manifest

When the add-in is installed, the **Dust (dev)** button is on the **Home** tab. Click the
button to open the task pane.

### Excel on the web

1. Open a workbook on `https://excel.cloud.microsoft`.
2. Select **Home** > **Add-ins** > **Advanced**.
3. Select **Upload My Add-in**.
4. Select `manifest.dev.xml`. Click **Upload**.

## Sign-in

The task pane makes a PKCE pair and opens an Office dialog on `auth.html`. On the first visit,
this page goes to `/api/workos/login` with `redirect_uri=<add-in origin>/auth.html`. After
sign-in, WorkOS goes back to `auth.html` with `code` (or `error`). On this second visit, the page
loads Office.js and sends the code to the task pane, which gets the tokens from
`/api/workos/authenticate`. The tokens are in `localStorage`.
