---
name: dust-webhook-source
description: Implement a new built-in webhook source provider in `front`. Use when adding a webhook provider such as Linear, GitHub, or Fathom, including provider research, OAuth prerequisites, provider-specific types and client code, preset registration, UI components, and end-to-end testing.
---

# Front Webhook Sources

Implement built-in webhook providers across two trees:

- `front/lib/triggers/built-in-webhooks/<provider>/` — UI-safe: presets, schemas, types, React components
- `front/lib/api/triggers/built-in-webhooks/<provider>/` — server-only: service + provider HTTP client

The boundary is load-bearing. Anything reached from the UI must never transitively import
`@app/lib/api/config`, `OAuthAPI`, or other backend modules — putting server code under `lib/api/`
is how we enforce that. Do not re-introduce a `webhookService` field on the preset or instantiate
the service from `preset.ts`: the leak that motivated the split will come right back.

The work spans provider research, OAuth prerequisites, typed remote metadata, a provider client,
the remote webhook service, preset registration, services-map registration, and the setup/details UI.

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
- `front/types/triggers/webhooks_client_side.ts`
- `front/lib/api/triggers/built-in-webhooks/services.ts` (register the service instance)
- `front/lib/api/triggers/built-in-webhooks/<provider>/<provider>_client.ts` (server-only)
- `front/lib/api/triggers/built-in-webhooks/<provider>/service.ts` (server-only)
- `front/lib/triggers/built-in-webhooks/<provider>/types.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/preset.ts`
- `front/lib/triggers/built-in-webhooks/<provider>/client_side.ts`
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

In `front/types/triggers/webhooks_client_side.ts`:

- import the provider client-side preset
- register it in `CLIENT_SIDE_WEBHOOK_PRESETS`

In `front/lib/api/triggers/built-in-webhooks/services.ts`:

- import the provider service class (from `lib/api/...`, not `lib/...`)
- register an instance in `WEBHOOK_SERVICES`. This map is the server-only dispatch used by
  webhook create/delete/service-data endpoints. It must never be imported from UI code.

### 2. Define metadata and type guards

In `types.ts`, define:

- create-time metadata entered by the user
- persisted metadata that also includes provider webhook ids
- runtime type guards for both
- optional additional OAuth data such as teams or repositories

Always keep remote metadata serializable. No functions or class instances.

### 3. Implement the provider client

`<provider>_client.ts` lives under `front/lib/api/triggers/built-in-webhooks/<provider>/` and
should be a thin wrapper over the provider API. It is server-only; do not import it from UI code.

Typical methods:

- `createWebhook(...)`
- `deleteWebhook(...)`
- `getTeams()` / `getRepositories()` / similar when setup requires selection data

Return typed results and map the provider response into the local metadata shape.

### 4. Implement the remote webhook service

In `front/lib/api/triggers/built-in-webhooks/<provider>/service.ts`, implement
`RemoteWebhookService<"<provider>">`. This file is server-only — it will import `OAuthAPI` and
`@app/lib/api/config`, which must never reach the client bundle.

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

- `preset.ts` exports a `BaseWebhookPreset` — data-only, UI-safe, worker-safe. Do not import
  React, icons, or the service here. The service is registered separately in `WEBHOOK_SERVICES`
  (see step 1).
- `client_side.ts` exports a `ClientSideWebhookPreset` — it spreads the base preset and adds
  the provider icon plus React components.

Set on the base preset (`preset.ts`):

- `eventCheck` to match how the provider exposes event type
- the full list of supported events
- optional `webhookPageUrl`

Set on the client-side preset (`client_side.ts`):

- `icon`
- the React components (`detailsComponent`, `createFormComponent`, and
  optionally `oauthExtraConfigInput`)

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

- forgetting to register the data preset in `WEBHOOK_PRESETS` or the client-side preset in
  `CLIENT_SIDE_WEBHOOK_PRESETS`
- forgetting to register the service in `WEBHOOK_SERVICES`
- putting the service or provider client under `lib/triggers/...` instead of `lib/api/triggers/...`
  (leaks `OAuthAPI` and backend config into the client bundle)
- importing React, icons, or the service from `preset.ts` (any of those turn `BaseWebhookPreset`
  into a client-only module and reintroduces the bundle leak)
- putting the icon on the base preset rather than the client-side preset
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
