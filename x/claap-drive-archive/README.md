# Claap → Google Drive archive

Internal ops automation. **Not part of the Dust product.**

It copies every Claap recording's *raw* data into a company Google Drive folder,
one subfolder per recorder, with no AI notes or generated summaries.

Host this on **Pipedream**. The TypeScript here is the testable source of truth
plus a local backfill CLI. The files in `pipedream/` are what you paste into
Pipedream workflows.

## Why Pipedream

Claap webhooks are created in the Claap UI (not via API) and must return HTTP
200 within 5 seconds. Pipedream gives us:

- a public HTTPS endpoint for `recording_added` / `recording_updated`
- a secrets vault for the Claap API key and webhook secret
- a first-party Google Drive OAuth connection
- retries and run logs
- a scheduled backfill so a failed run does not lose recordings

Keep the archive off personal Drives. Use a **Shared Drive** owned by the
workspace, connected with a dedicated Google account (for example
`claap-archive@dust.tt`).

## What gets stored

```
<Shared Drive>/Claap Recordings/
  ilias@dust.tt/
    2026-09-12_Discovery-call-with-Acme-Q3_rec_abc123.md
    2026-09-12_Discovery-call-with-Acme-Q3_rec_abc123.json
  iris@dust.tt/
    ...
```

The markdown file is the durable document: YAML metadata (who recorded, who
attended, source, deal, Claap URL) and the **word-for-word transcript**. See
`examples/sample-archive.md`.

The JSON file is the untouched Claap recording + transcript payload.

Video upload is **off by default**. Claap video URLs expire in 24 hours and
meeting files are large. Turn it on in the Pipedream props if you want `.mp4`
files next to the transcript. Private Claap recordings never appear on the
webhook.

## Deploy on Pipedream

### 1. Drive folder

1. Create a Shared Drive folder named `Claap Recordings`.
2. Copy the folder ID from the URL (`https://drive.google.com/drive/folders/<ID>`).

### 2. Webhook workflow

1. Create a Pipedream workflow with trigger **HTTP / Webhook Requests**.
2. Set the HTTP response to **Return a custom response from your workflow**.
3. Add a Node.js code step and paste `pipedream/webhook-archive.js`.
4. Connect a Google Drive account that can write to the Shared Drive.
5. Fill in:
   - Claap API key (`cla_…`)
   - Claap webhook secret (you choose this; Claap sends it back as `X-Claap-Webhook-Secret`)
   - root folder ID
6. Deploy and copy the workflow URL.

### 3. Claap webhook

In Claap admin → Webhooks, create a webhook:

- events: `recording_added`, `recording_updated`
- destination: the Pipedream URL
- secret: the same value as the workflow prop

### 4. Backfill workflow

Create a second workflow with a **Schedule** trigger (every hour or daily).
Paste `pipedream/scheduled-backfill.js`. Use the same Drive connection, API key,
and folder ID. Default lookback is 48 hours. Safe to rerun: files upsert by
`claapRecordingId`.

## Local backfill

For a one-off historical import, or to test without Pipedream:

```bash
cd x/claap-drive-archive
cp .env.example .env   # fill in keys
gcloud auth application-default login   # or set GOOGLE_APPLICATION_CREDENTIALS
npm test
npm run backfill -- --days=30
```

## Security

- Store `CLAAP_API_KEY` and the webhook secret only in Pipedream / `.env` (gitignored).
- Restrict the Drive folder to the people who should see call corpus data.
- The markdown archive does not include Claap AI fields, outlines, or takeaways.
  Those stay in the JSON dump if you need them later.

## Moving this out of dust-tt

This folder is only parked under `x/` so the logic can be reviewed and tested.
It can be copied into a private ops repo at any time. Nothing here is imported
by `front`, `front-api`, or any Dust runtime.
