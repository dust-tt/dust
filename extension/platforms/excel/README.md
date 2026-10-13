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
