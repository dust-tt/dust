# Provider Research

Use this reference before implementation when provider docs are unclear or when you need a more
structured checklist than the short list in `SKILL.md`.

## OAuth Configuration Must Already Exist

**Critical:** Before implementing a webhook source, the provider must already have OAuth
configured in both:

- `front/lib/api/oauth/providers/{provider}.ts` - Front OAuth provider
- `core/src/oauth/providers/{provider}.rs` - Core OAuth implementation

The OAuth provider must support the `webhooks` use case with appropriate scopes for webhook
management (for example `admin`, `webhooks:manage`, and similar scopes).

## Research Phase

**Before starting implementation, thoroughly research the provider's API. Document your findings
before writing any code.**

### 1. Can webhooks be created programmatically?

**Search queries to try:**

- `{provider} API webhooks`
- `{provider} REST API create webhook`
- `{provider} developer documentation webhooks`
- `site:developers.{provider}.com webhooks`

**What to look for:**

- REST API endpoints like `POST /webhooks`, `POST /api/webhooks`, `POST /v1/hooks`
- GraphQL mutations like `createWebhook`
- SDK methods like `client.webhooks.create()`

**If webhooks can only be created manually through a UI, stop here.** You cannot create a built-in
webhook source for this provider.

**Document:**

```text
Webhook Creation Endpoint: POST https://api.provider.com/v1/webhooks
Documentation URL: https://developers.provider.com/docs/webhooks
```

### 2. What authentication is required?

Check the API documentation for:

- OAuth 2.0 access tokens (preferred, because it integrates with existing OAuth)
- API keys or personal access tokens
- special webhook-specific secrets
- required OAuth scopes (for example `webhooks:write`, `admin`, `manage:webhooks`)

**Document:**

```text
Auth Method: OAuth 2.0 Bearer token
Required Scopes: admin, webhooks:write
Header Format: Authorization: Bearer {access_token}
```

### 3. What is the webhook creation request and response format?

Find and save example API calls:

```bash
curl -X POST https://api.provider.com/v1/webhooks \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["item.created", "item.updated"],
    "secret": "optional_signing_secret"
  }'

{
  "id": "wh_123abc",
  "url": "https://example.com/webhook",
  "events": ["item.created", "item.updated"],
  "active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

### 4. What webhook events are available?

Find the complete list of event types:

- Search: `{provider} webhook events list`
- Look for event catalogs in documentation

**Document each event:**

```text
| Event Name       | Description                    | Payload Example URL           |
|------------------|--------------------------------|-------------------------------|
| item.created     | Fired when item is created     | docs.provider.com/events#item |
| item.updated     | Fired when item is modified    | docs.provider.com/events#item |
| item.deleted     | Fired when item is removed     | docs.provider.com/events#item |
```

### 5. How are incoming webhooks identified?

Check how to determine which event type was received:

- HTTP headers such as `X-Provider-Event`, `X-Event-Type`, `X-Hook-Event`
- request body fields such as `event`, `type`, `action`, `event_type`

**Document:**

```text
Event Identification: Header "X-Provider-Event" contains event type
Example: X-Provider-Event: item.created
```

### 6. What metadata is needed?

Determine what the user must configure:

- team, workspace, or organization selection
- repository or project selection
- event type filtering
- custom webhook name

**Document:**

```text
Required User Input:
- team_id: User must select which team (fetched via GET /teams)
- events: User selects from available event types

Optional:
- webhook_name: Custom name for the webhook
```

### 7. How are webhooks deleted?

Find the deletion endpoint:

```text
DELETE https://api.provider.com/v1/webhooks/{webhook_id}
Response: 204 No Content (on success)
```

### 8. Does the provider support webhook signatures?

Check for payload verification:

- signing secret configuration
- signature header such as `X-Provider-Signature` or `X-Hub-Signature-256`
- verification algorithm such as HMAC-SHA256

**Document:**

```text
Signature Header: X-Provider-Signature-256
Algorithm: HMAC-SHA256
Verification: Compare HMAC of raw body with signature header
```
