# Pipedream setup

Two workflows. Same Google Drive connection and Claap API key.

## Workflow A — live archive

1. New workflow → trigger **New HTTP / Webhook Requests**.
2. In the trigger:
   - HTTP Response: **Return a custom response from your workflow**
   - leave auth on the workflow (the code checks `X-Claap-Webhook-Secret`)
3. Add step → **Run Node.js code**.
4. Replace the stub with the contents of `webhook-archive.js`.
5. Connect Google Drive (grant Drive file access).
6. Set props:
   - `claapApiKey`
   - `claapWebhookSecret`
   - `rootFolderId`
   - `uploadVideo` = false unless you explicitly want mp4s
7. Deploy. Copy the endpoint URL into Claap → Webhooks.

Claap must get HTTP 200 within 5 seconds. The step acknowledges first, then
writes to Drive. If a write fails, workflow B repairs it.

## Workflow B — catch-up

1. New workflow → trigger **Schedule** → every 1 hour (or daily).
2. Add a Node.js step and paste `scheduled-backfill.js`.
3. Reuse the same Drive account, API key, and folder ID.
4. `lookbackHours` defaults to 48.

## Test without a real meeting

Use Claap `POST /v1/webhooks/{webhookId}/trigger` with:

```json
{ "type": "recording_added", "recordingId": "<existing recording id>" }
```

Or send a Pipedream test event whose body is:

```json
{
  "eventId": "test",
  "event": {
    "type": "recording_added",
    "recording": { "id": "<existing recording id>" }
  }
}
```

Include header `X-Claap-Webhook-Secret: <your secret>`.
