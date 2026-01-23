# Webhook Sources Runbook: Creating New Webhook Providers

This runbook explains the process for implementing new webhook source providers in Dust, allowing users to receive events from external services like Linear, GitHub, Fathom, etc.

---

## Quick Reference

### Minimal Files Needed

1. ✅ `types/triggers/webhooks.ts` - Add provider to enum
2. ✅ `lib/triggers/built-in-webhooks/{provider}/types.ts`
3. ✅ `lib/triggers/built-in-webhooks/{provider}/{provider}_client.ts`
4. ✅ `lib/triggers/built-in-webhooks/{provider}/service.ts`
5. ✅ `lib/triggers/built-in-webhooks/{provider}/preset.ts`
6. ✅ `lib/triggers/built-in-webhooks/{provider}/schemas/` (at least one event)
7. ✅ `lib/triggers/built-in-webhooks/{provider}/components/`

### OAuth Requirements

- ⚠️ OAuth provider must already exist in `lib/api/oauth/providers/{provider}.ts`
- ⚠️ OAuth core implementation must exist in `core/src/oauth/providers/{provider}.rs`
- ⚠️ OAuth scopes must include webhook management permissions
- ⚠️ OAuth must support `useCase: "webhooks"`

### Common Gotchas

- ⚠️ Don't forget to add provider to `WEBHOOK_PRESETS` object
- ⚠️ Webhook URL must be publicly accessible (use `DUST_WEBHOOKS_PUBLIC_URL` for local dev)
- ⚠️ Remote metadata must be serializable (no functions, classes)
- ⚠️ Always implement type guards for metadata validation
- ⚠️ Handle partial success when creating multiple webhooks

### Implementation Checklist

- [ ] **Research Phase** completed (see below)
- [ ] **Implementation** completed (all files created)
- [ ] **Testing** completed (OAuth, creation, events, deletion)

---

## Prerequisites

### OAuth Configuration Must Already Exist

**Critical:** Before implementing a webhook source, the provider must already have OAuth configured in both:

- `front/lib/api/oauth/providers/{provider}.ts` - Front OAuth provider
- `core/src/oauth/providers/{provider}.rs` - Core OAuth implementation

The OAuth provider must support the `webhooks` use case with appropriate scopes for webhook management (e.g., `admin`, `webhooks:manage`, etc.).

### Research Phase

**Before starting implementation, thoroughly research the provider's API. Document your findings before writing any code.**

#### 1. Can webhooks be created programmatically?

**Search queries to try:**

- `{provider} API webhooks`
- `{provider} REST API create webhook`
- `{provider} developer documentation webhooks`
- `site:developers.{provider}.com webhooks`

**What to look for:**

- REST API endpoints like `POST /webhooks`, `POST /api/webhooks`, `POST /v1/hooks`
- GraphQL mutations like `createWebhook`
- SDK methods like `client.webhooks.create()`

**If webhooks can only be created manually through a UI, STOP HERE** - you cannot create a built-in webhook source for this provider.

**Document:**

```
Webhook Creation Endpoint: POST https://api.provider.com/v1/webhooks
Documentation URL: https://developers.provider.com/docs/webhooks
```

#### 2. What authentication is required?

**Check the API documentation for:**

- OAuth 2.0 access tokens (preferred - integrates with existing OAuth)
- API keys / Personal access tokens
- Special webhook-specific secrets
- Required OAuth scopes (e.g., `webhooks:write`, `admin`, `manage:webhooks`)

**Document:**

```
Auth Method: OAuth 2.0 Bearer token
Required Scopes: admin, webhooks:write
Header Format: Authorization: Bearer {access_token}
```

#### 3. What is the webhook creation request/response format?

**Find and save example API calls:**

```bash
# Example: Document the exact curl command
curl -X POST https://api.provider.com/v1/webhooks \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["item.created", "item.updated"],
    "secret": "optional_signing_secret"
  }'

# Example response:
{
  "id": "wh_123abc",
  "url": "https://example.com/webhook",
  "events": ["item.created", "item.updated"],
  "active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

#### 4. What webhook events are available?

**Find the complete list of event types:**

- Search: `{provider} webhook events list`
- Look for event catalogs in documentation

**Document each event:**

```
| Event Name       | Description                    | Payload Example URL           |
|------------------|--------------------------------|-------------------------------|
| item.created     | Fired when item is created     | docs.provider.com/events#item |
| item.updated     | Fired when item is modified    | docs.provider.com/events#item |
| item.deleted     | Fired when item is removed     | docs.provider.com/events#item |
```

#### 5. How are incoming webhooks identified?

**Check how to determine which event type was received:**

- HTTP headers (common): `X-Provider-Event`, `X-Event-Type`, `X-Hook-Event`
- Request body field: `event`, `type`, `action`, `event_type`

**Document:**

```
Event Identification: Header "X-Provider-Event" contains event type
Example: X-Provider-Event: item.created
```

#### 6. What metadata is needed?

**Determine what the user must configure:**

- Team/Workspace/Organization ID selection
- Repository/Project selection
- Event type filtering
- Custom webhook name

**Document:**

```
Required User Input:
- team_id: User must select which team (fetched via GET /teams)
- events: User selects from available event types

Optional:
- webhook_name: Custom name for the webhook
```

#### 7. How are webhooks deleted?

**Find the deletion endpoint:**

```
DELETE https://api.provider.com/v1/webhooks/{webhook_id}
Response: 204 No Content (on success)
```

#### 8. Does the provider support webhook signatures?

**Check for payload verification:**

- Signing secret configuration
- Signature header (e.g., `X-Provider-Signature`, `X-Hub-Signature-256`)
- Verification algorithm (HMAC-SHA256, etc.)

**Document:**

```
Signature Header: X-Provider-Signature-256
Algorithm: HMAC-SHA256
Verification: Compare HMAC of raw body with signature header
```

---

## File Structure

For each webhook provider, you'll create:

```
front/lib/triggers/built-in-webhooks/your_provider/
├── preset.ts                       # Main configuration (most important)
├── service.ts                      # Webhook creation/deletion logic
├── your_provider_client.ts         # API client wrapper
├── types.ts                        # TypeScript types
├── constants.ts                    # Constants (optional)
├── components/
│   ├── CreateWebhookYourProviderConnection.tsx
│   └── WebhookSourceYourProviderDetails.tsx
└── schemas/
    └── your_event.ts               # Event schemas

types/triggers/
└── webhooks.ts                     # Add provider to WEBHOOK_PROVIDERS
```

---

## Step-by-Step Implementation

### Step 1: Register the Provider

**Add to `types/triggers/webhooks.ts`:**

```typescript
// 1. Add to the provider list
export const WEBHOOK_PROVIDERS = [
  // ... existing providers
  "your_provider",
] as const;

// 2. Add to the service data map (if you need additional data from OAuth)
type WebhookProviderServiceDataMap = {
  // ... existing providers
  your_provider: YourProviderAdditionalData;
};

// 3. Import and register the preset at the bottom of the file
import { YOUR_PROVIDER_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/your_provider/preset";

export const WEBHOOK_PRESETS = {
  // ... existing providers
  your_provider: YOUR_PROVIDER_WEBHOOK_PRESET,
} satisfies {
  [P in WebhookProvider]: PresetWebhook<P>;
};
```

### Step 2: Define Types

**Create `types.ts`:**

Define the metadata structures based on your API research:

```typescript
// Metadata needed to CREATE a webhook (user provides this)
export type YourProviderWebhookCreateMetadata = {
  team_id?: string; // What configuration does the user need to provide?
  resource_types: string[]; // Which events to subscribe to?
  // Add other fields your API requires
};

// Metadata AFTER webhook is created (includes provider's webhook ID)
export type YourProviderWebhookMetadata = YourProviderWebhookCreateMetadata & {
  webhookId: string; // ID returned by the provider's API
};

// Type guards for runtime validation
export function isYourProviderWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is YourProviderWebhookCreateMetadata {
  // Validate the structure
}

export function isYourProviderWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is YourProviderWebhookMetadata {
  // Validate including webhookId
}

// Additional data fetched during OAuth (optional - e.g., list of teams)
export type YourProviderAdditionalData = {
  teams?: Array<{ id: string; name: string }>;
};
```

### Step 3: Create API Client

**Create `{provider}_client.ts`:**

This is a thin wrapper around the provider's REST API. Based on your API research:

```typescript
export class YourProviderClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // Implement based on provider's API documentation
  async createWebhook(
    config: YourProviderWebhookConfig
  ): Promise<Result<YourProviderWebhook, Error>> {
    // Call the provider's webhook creation endpoint
    // Example: POST https://api.provider.com/webhooks
    // Return the webhook object including its ID
  }

  async deleteWebhook(webhookId: string): Promise<Result<void, Error>> {
    // Call the provider's webhook deletion endpoint
    // Example: DELETE https://api.provider.com/webhooks/{id}
  }

  // Optional: fetch additional data needed for configuration
  async getTeams(): Promise<
    Result<Array<{ id: string; name: string }>, Error>
  > {
    // If users need to select a team/workspace/org
  }
}
```

**Key Points:**

- Use the provider's REST API documentation
- Handle authentication (usually `Bearer ${accessToken}`)
- Return `Result<T, Error>` for error handling
- Map provider's response format to your types

### Step 4: Implement Webhook Service

**Create `service.ts`:**

This implements the `RemoteWebhookService` interface. Here are the method signatures and what each does:

```typescript
export class YourProviderWebhookService implements RemoteWebhookService<"your_provider"> {
  // Called during OAuth setup to fetch additional configuration data
  // (e.g., list of teams, workspaces, repositories)
  async getServiceData(
    oauthToken: string
  ): Promise<Result<YourProviderAdditionalData, Error>>;

  // Called when user creates a webhook source
  // Creates the actual webhook(s) on the provider's side
  async createWebhooks({
    auth,
    connectionId, // OAuth connection ID
    remoteMetadata, // User's configuration (team selection, etc.)
    webhookUrl, // The URL to send webhooks to (provided by Dust)
    events, // Event types to subscribe to
    secret, // Optional secret for signature verification
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, unknown>; // Must include webhook IDs
        errors?: string[]; // Partial success errors
      },
      Error
    >
  >;

  // Called when user deletes a webhook source
  // Deletes the webhook(s) from the provider's side
  async deleteWebhooks({
    auth,
    connectionId,
    remoteMetadata, // Contains webhook IDs to delete
  }): Promise<Result<void, Error>>;
}
```

**Implementation Flow:**

1. **getServiceData:** Use the OAuth token to fetch data the user needs for configuration (teams, repos, etc.). This data is passed to the React component.

2. **createWebhooks:**
   - Validate `remoteMetadata` using type guards
   - Get OAuth access token using `OAuthAPI`
   - Create client instance with access token
   - Call provider's API to create webhook(s)
   - Return updated metadata with webhook ID(s)
   - If creating multiple webhooks (e.g., one per team), accumulate errors and return partial success

3. **deleteWebhooks:**
   - Extract webhook ID(s) from `remoteMetadata`
   - Get OAuth access token
   - Call provider's API to delete webhook(s)
   - Log failures but don't block (local deletion happens regardless)

### Step 5: Define Event Schemas

**Create `schemas/{event_name}.ts`:**

**Research process:**

1. Search for "{provider} webhook payload", "{provider} webhook events documentation"
2. Find example webhook payloads in the provider's docs
3. Convert to JSON Schema format

```typescript
import type { JSONSchema7 as JSONSchema } from "json-schema";

// Define the schema based on provider's documentation
export const yourEventSchema: JSONSchema = {
  type: "object",
  properties: {
    event_type: { type: "string" },
    // Map the provider's payload structure
  },
  required: ["event_type"],
};

// OPTIONAL: Provide an example for documentation
// This helps users understand what the webhook payload looks like
export const yourEventExample = {
  event_type: "item.created",
  // ... example payload
};
```

**Tips:**

- Create one schema file per event type (or group related events)
- The schema helps validate incoming webhooks
- The example is optional but helpful for users

### Step 6: Create React Components

You need two components:

#### CreateWebhookYourProviderConnection.tsx

**Purpose:** Configuration form for setting up the webhook source

**What it should do:**

1. **OAuth Connection:**
   - Use `useCreateOAuthConnection` hook with `provider` and `useCase: "webhooks"`
   - OAuth flow is handled automatically by existing OAuth configuration
   - Once connected, the `connectionId` is available

2. **Fetch Configuration Data:**
   - If needed, use the `connectionId` to fetch teams/repos/etc.
   - This data might come from `additionalData` returned by OAuth
   - Or fetch it via an API endpoint using the connection

3. **User Selection/Configuration:**
   - Display UI for user to configure the webhook (dropdowns, checkboxes, etc.)
   - For example: team selection, event type selection, etc.

4. **Notify Parent:**
   - Call `onDataToCreateWebhookChange({ connectionId, remoteMetadata })` with user's selections
   - Call `onReadyToSubmitChange(true)` when configuration is complete

**Look at similar components:**

- `CreateWebhookLinearConnection.tsx` - Shows team selection
- `CreateWebhookGithubConnection.tsx` - Shows repository selection
- `CreateWebhookFathomConnection.tsx` - Simple, no extra configuration

#### WebhookSourceYourProviderDetails.tsx

**Purpose:** Display information about an existing webhook source

**What it should do:**

1. **Display Connection Status:**
   - Show that it's connected to the provider
   - Display relevant metadata (team name, webhook ID, etc.)

2. **Read-Only Information:**
   - Extract data from `webhookSource.remoteMetadata`
   - Format for display (e.g., "Connected to Team: Engineering")

3. **Keep It Simple:**
   - This is just informational
   - Users can't edit here (they delete and recreate if needed)

### Step 7: Create Preset Configuration

**Create `preset.ts`:**

This is the most important file - it ties everything together:

```typescript
import { CreateWebhookYourProviderConnection } from "./components/CreateWebhookYourProviderConnection";
import { WebhookSourceYourProviderDetails } from "./components/WebhookSourceYourProviderDetails";
import { yourEventSchema, yourEventExample } from "./schemas/your_event";
import { YourProviderWebhookService } from "./service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

// Define available events
const YOUR_PROVIDER_EVENT: WebhookEvent = {
  name: "item.created", // Display name
  value: "item.created", // Event type value from provider's API
  description: "Triggered when a new item is created",
  schema: yourEventSchema,
  sample: yourEventExample, // Optional
};

export const YOUR_PROVIDER_WEBHOOK_PRESET: PresetWebhook<"your_provider"> = {
  name: "Your Provider",

  // How to identify events from this provider
  eventCheck: {
    type: "headers", // or "body"
    field: "X-YourProvider-Event", // Header name or body field
  },

  events: [YOUR_PROVIDER_EVENT], // List all available events

  icon: "YourProviderLogo", // Add to resources_icons.tsx

  description: "Receive events from Your Provider",

  webhookPageUrl: "https://yourprovider.com/settings/webhooks", // Optional

  webhookService: new YourProviderWebhookService(),

  components: {
    detailsComponent: WebhookSourceYourProviderDetails,
    createFormComponent: CreateWebhookYourProviderConnection,
  },
};
```

**Key Decisions:**

1. **eventCheck:** How to identify incoming webhooks?
   - `type: "headers"` - Check HTTP header (common: `X-Provider-Event`, `X-Event-Type`)
   - `type: "body"` - Check field in JSON body
   - `field` - The header name or JSON path

2. **events:** List all event types the provider supports
   - Users will select which events they want
   - Each event needs a schema

3. **webhookPageUrl:** Optional link to provider's webhook settings page
   - Shown to users for reference

---

## Common Patterns

### Single Webhook (Fathom)

- Simple OAuth flow
- No additional configuration needed
- One webhook per workspace
- Single event type

### Multiple Webhooks Per Team (Linear)

- User selects teams during setup
- Creates one webhook per selected team
- Stores array of webhook IDs
- Requires fetching team list via API

### Repository-Based (GitHub)

- User selects repositories
- Creates webhooks per repository
- Multiple event type options
- Requires repository permissions check

---

## Reference PRs

### Fathom Webhook Source

**PR:** [#17757 - feat(triggers): add Fathom as webhook provider](https://github.com/dust-tt/dust/pull/17757)

**Key Features:**

- Single event type (meeting content ready)
- Simple metadata structure
- OAuth with `public_api` scope
- Webhook signature verification

**Files Modified:**

- `lib/triggers/built-in-webhooks/fathom/`
  - `preset.ts`, `service.ts`, `fathom_client.ts`, `types.ts`
  - `components/`, `schemas/`

### Linear Webhook Source

**PR:** [#17916 - linear webhook source](https://github.com/dust-tt/dust/pull/17916)

**Key Features:**

- Multiple teams support
- Per-team webhook creation
- Advanced OAuth scopes (`read`, `write`, `admin`)
- Team selection UI

**Files Modified:**

- `lib/triggers/built-in-webhooks/linear/`
  - `preset.ts`, `service.ts`, `linear_client.ts`, `types.ts`
  - `components/`, `constants.ts`

### Common Patterns

Both PRs follow the same structure:

1. Type definitions in `types.ts`
2. API client in `{provider}_client.ts`
3. Webhook service implementing `RemoteWebhookService`
4. React components for UI
5. Preset configuration tying everything together
6. OAuth integration using existing provider configuration

---

## Testing

### Local Development Setup

1. **Expose your local webhook endpoint publicly:**

   ```bash
   # Using ngrok (recommended)
   ngrok http 3000

   # Copy the HTTPS URL, e.g., https://abc123.ngrok.io
   ```

2. **Set environment variable:**

   ```bash
   export DUST_WEBHOOKS_PUBLIC_URL=https://abc123.ngrok.io
   ```

3. **Restart your local dev server** to pick up the new URL.

### Manual Testing Checklist

#### 1. OAuth Connection

- [ ] Navigate to webhook source creation in the UI
- [ ] Click "Connect to {Provider}"
- [ ] Complete OAuth flow successfully
- [ ] Verify connection shows as "Connected" in UI
- [ ] Check that any additional data loads (teams, repos, etc.)

#### 2. Webhook Creation

- [ ] Complete the configuration form (select teams, events, etc.)
- [ ] Click "Create" and verify no errors
- [ ] **Verify in provider's dashboard:** Log into the provider and check their webhooks settings page - your webhook should appear
- [ ] Note the webhook ID shown in provider's dashboard matches what's stored

#### 3. Event Reception

- [ ] Trigger a test event in the provider (create an item, make a change, etc.)
- [ ] Check your local server logs for the incoming webhook
- [ ] Verify the event payload matches expected schema
- [ ] Confirm the event type is correctly identified (via header or body)

#### 4. Webhook Deletion

- [ ] Delete the webhook source in Dust UI
- [ ] **Verify in provider's dashboard:** The webhook should be removed
- [ ] Check logs for any deletion errors (should be logged but not block UI)

---

## Additional Resources

- [Webhook Source Resource](https://github.com/dust-tt/dust/blob/main/front/lib/resources/webhook_source_resource.ts)
- [Remote Webhook Service Interface](https://github.com/dust-tt/dust/blob/main/front/types/triggers/remote_webhook_service.ts)
- [Preset Webhook Type](https://github.com/dust-tt/dust/blob/main/front/types/triggers/webhooks_source_preset.ts)
