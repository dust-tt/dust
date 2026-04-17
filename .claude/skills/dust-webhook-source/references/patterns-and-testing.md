# Patterns And Testing

Use this reference when you need a concrete provider shape to copy, example PRs, or more detailed
manual testing steps than the short checklist in `SKILL.md`.

## File Structure

For each webhook provider, you will create:

```text
front/lib/triggers/built-in-webhooks/your_provider/
├── preset.ts
├── preset_ui.ts
├── service.ts
├── your_provider_client.ts
├── types.ts
├── constants.ts
├── components/
│   ├── CreateWebhookYourProviderConnection.tsx
│   └── WebhookSourceYourProviderDetails.tsx
└── schemas/
    └── your_event.ts

front/types/triggers/
└── webhooks.ts
```

## Common Patterns

### Single Webhook (Fathom)

- Simple OAuth flow
- No additional configuration needed
- One webhook per workspace
- Single event type

### Multiple Webhooks Per Team (Linear)

- User selects teams during setup
- Creates one webhook per selected team
- Stores an array of webhook IDs
- Requires fetching the team list via API

### Repository-Based (GitHub)

- User selects repositories
- Creates webhooks per repository
- Multiple event type options
- Requires repository permissions checks

## Reference PRs

### Fathom Webhook Source

**PR:** [#17757 - feat(triggers): add Fathom as webhook provider](https://github.com/dust-tt/dust/pull/17757)

**Key Features:**

- single event type (meeting content ready)
- simple metadata structure
- OAuth with `public_api` scope
- webhook signature verification

**Files Modified:**

- `lib/triggers/built-in-webhooks/fathom/`
  - `preset.ts`, `service.ts`, `fathom_client.ts`, `types.ts`
  - `components/`, `schemas/`

### Linear Webhook Source

**PR:** [#17916 - linear webhook source](https://github.com/dust-tt/dust/pull/17916)

**Key Features:**

- multiple teams support
- per-team webhook creation
- advanced OAuth scopes (`read`, `write`, `admin`)
- team selection UI

**Files Modified:**

- `lib/triggers/built-in-webhooks/linear/`
  - `preset.ts`, `service.ts`, `linear_client.ts`, `types.ts`
  - `components/`, `constants.ts`

### Shared Structure

Both reference PRs follow the same shape:

1. type definitions in `types.ts`
2. API client in `{provider}_client.ts`
3. webhook service implementing `RemoteWebhookService`
4. React components for UI
5. preset configuration tying everything together
6. OAuth integration using the existing provider configuration

## Local Development Setup

1. Expose your local webhook endpoint publicly:

   ```bash
   ngrok http 3000
   ```

2. Set `DUST_WEBHOOKS_PUBLIC_URL` to the public HTTPS URL.
3. Restart the local dev server so the new URL is picked up.

## Manual Testing Checklist

### 1. OAuth Connection

- Navigate to webhook source creation in the UI.
- Click `Connect to {Provider}`.
- Complete the OAuth flow successfully.
- Verify the connection shows as connected in the UI.
- Check that any additional data loads (teams, repositories, and similar setup data).

### 2. Webhook Creation

- Complete the configuration form.
- Click create and verify no errors.
- Verify the webhook appears in the provider dashboard.
- Note that the provider-side webhook ID matches the persisted remote metadata.

### 3. Event Reception

- Trigger a real provider event.
- Check local server logs for the incoming webhook.
- Verify the payload matches the expected schema.
- Confirm the event type is correctly identified via the configured header or body field.

### 4. Webhook Deletion

- Delete the webhook source in Dust UI.
- Verify the provider-side webhook is removed.
- Check logs for deletion failures. They should be logged, but should not block local deletion.
