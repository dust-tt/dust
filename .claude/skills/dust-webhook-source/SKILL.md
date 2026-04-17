---
name: dust-webhook-source
description: Implement a new built-in webhook source provider in `front`. Use when adding a webhook provider such as Linear, GitHub, or Fathom, including provider research, OAuth prerequisites, provider-specific types and client code, preset registration, UI components, and end-to-end testing.
---

# Front Webhook Sources

Implement built-in webhook providers under `front/lib/triggers/built-in-webhooks/<provider>/`.
The work spans provider research, OAuth prerequisites, typed remote metadata, a provider client,
the remote webhook service, preset registration, and the setup/details UI.

## Hard Prerequisites

Do not start implementation until both of these already exist:

- `front/lib/api/oauth/providers/<provider>.ts`
- `core/src/oauth/providers/<provider>.rs`

The provider must support the `webhooks` use case and have scopes that can manage webhooks.

If the provider only allows webhooks to be created manually in its UI, stop. It is not a fit for a
built-in webhook source.

## Research First

Before writing code, document these answers from the provider docs:

- how to create a webhook programmatically
- required auth method and OAuth scopes
- request and response payloads for create and delete
- available event types and sample payloads
- how the incoming event type is identified: header or body field
- what user-configurable metadata is required, such as team or repository selection
- whether webhook signatures exist and how to verify them

This research determines the metadata types, client methods, event schemas, and UI.

## Files To Touch

Minimal implementation:

- `front/types/triggers/webhooks.ts`
- `front/types/triggers/webhooks_ui.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/types.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/<provider>_client.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/service.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/preset.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/preset_ui.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/schemas/*`
- `front/lib/triggers/built-in-webhooks/<provider>/components/*`

Use existing providers as templates:

- `fathom` for the simplest shape
- `linear` for team-scoped webhook creation
- `github` for repository-driven configuration

## Workflow

### 1. Register the provider

In `front/types/triggers/webhooks.ts`:

- add the provider to `WEBHOOK_PROVIDERS`
- extend `WebhookProviderServiceDataMap` if the provider needs extra OAuth-fetched data
- register the preset in `WEBHOOK_PRESETS`

In `front/types/triggers/webhooks_ui.ts`:

- import the provider UI preset
- register it in `WEBHOOK_PRESETS_UI`

### 2. Define metadata and type guards

In `types.ts`, define:

- create-time metadata entered by the user
- persisted metadata that also includes provider webhook ids
- runtime type guards for both
- optional additional OAuth data such as teams or repositories

Always keep remote metadata serializable. No functions or class instances.

### 3. Implement the provider client

`<provider>_client.ts` should be a thin wrapper over the provider API.

Typical methods:

- `createWebhook(...)`
- `deleteWebhook(...)`
- `getTeams()` / `getRepositories()` / similar when setup requires selection data

Return typed results and map the provider response into the local metadata shape.

### 4. Implement the remote webhook service

In `service.ts`, implement `RemoteWebhookService<"<provider>">`.

Core responsibilities:

- `getServiceData(oauthToken)` fetches setup data for the form
- `createWebhooks(...)` validates metadata, creates provider-side webhooks, and returns
  `updatedRemoteMetadata` including webhook ids
- `deleteWebhooks(...)` removes provider-side webhooks using the persisted ids

When multiple webhooks may be created, handle partial success explicitly and return user-facing
errors without losing the successfully created ids.

### 5. Define event schemas

Create one schema file per event, or one per coherent event family, under `schemas/`.

Each event entry should provide:

- the event name/value exposed in the UI
- a JSON schema for the payload
- an optional sample payload when it clarifies the shape

### 6. Build the presets

Split preset code correctly:

- `preset.ts` is data-only and worker-safe; do not import React there
- `preset_ui.ts` adds the React components

Set:

- `eventCheck` to match how the provider exposes event type
- the full list of supported events
- the provider icon
- optional `webhookPageUrl`
- the concrete webhook service instance

### 7. Build the UI components

Create:

- `CreateWebhook<Provider>Connection.tsx`
- `WebhookSource<Provider>Details.tsx`

The create form should:

- rely on `front/components/triggers/CreateWebhookSourceWithProviderForm.tsx` for the OAuth
  connection flow via `setupOAuthConnection(...)`
- treat `connectionId` as an input prop; do not recreate the OAuth flow inside the provider-specific
  form
- fetch provider-specific setup data with `useWebhookServiceData({ owner, connectionId, provider })`
- call `onDataToCreateWebhookChange({ connectionId, remoteMetadata })`
- call `onReadyToSubmitChange(true)` only when configuration is complete

The details component should stay read-only and summarize the persisted remote metadata.

## Common Gotchas

- forgetting to add the preset to `WEBHOOK_PRESETS`
- importing React from `preset.ts`
- storing non-serializable remote metadata
- skipping type guards before using `remoteMetadata`
- assuming a single webhook when the provider needs one per team or repository
- ignoring partial success during multi-webhook creation
- forgetting to make local webhook URLs public during manual testing

## Testing

For local testing, expose the local app publicly and set `DUST_WEBHOOKS_PUBLIC_URL`.

Manual checklist:

- complete the OAuth flow successfully
- create the webhook source in the UI without errors
- verify the webhook exists in the provider dashboard
- trigger a real provider event and inspect local logs
- confirm the incoming payload matches the registered schema and event detection logic
- delete the source and verify the provider-side webhook is removed

## References

- `front/lib/resources/webhook_source_resource.ts`
- `front/types/triggers/remote_webhook_service.ts`
- `front/types/triggers/webhooks_source_preset.ts`
