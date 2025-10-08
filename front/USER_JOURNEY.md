## Quick Start

### What’s Tracked Automatically

✅ **All pageviews** - No manual tracking needed
✅ **All clicks with tracking attributes** - key events across user journey
✅ **User identification** - Automatic when logged in
✅ **Plan information** - Automatically attached to every event (workspace level)

### Access the Data

1. Open PostHog
2. Go to “Insights” or “Funnels”
3. Filter by any event listed below
4. Use user properties (plan_code, is_trial) to segment

---

## User Properties & Filtering

### Automatic Properties on EVERY Event

**User Properties** (individual level):

- `workspace_id` - Workspace identifier

**Workspace Group Properties** (team level):

- `plan_code` - Subscription plan code (e.g., "PRO_PLAN_SEAT_29")
- `plan_name` - Human-readable plan name (e.g., "Pro")
- `plan_type` - Plan tier: "ENTERPRISE", "PRO", "FREE", or "OTHER"
- `is_trial` - "true" or "false"

---

## Complete Event Catalog

### Stage 1: Discovery (Anonymous Visitors)

**Homepage - 5 events**

| Event                           | Location       | Description            | File                       |
| ------------------------------- | -------------- | ---------------------- | -------------------------- |
| `home:hero_get_started:click`   | Hero section   | Main "Get Started" CTA | IntroSection.tsx           |
| `home:hero_book_demo:click`     | Hero section   | "Book a Demo" CTA      | IntroSection.tsx           |
| `home:hero_watch_video:click`   | Hero video     | Play demo video button | IntroSection.tsx           |
| `home:cta_try_dust:click`       | Bottom section | "Try Dust" CTA         | CallToActionSection.tsx    |
| `home:cta_request_demo:click`   | Bottom section | "Request Demo" CTA     | CallToActionSection.tsx    |

**Tracking topology:** `home:{object}:click`

---

**Navigation (Header) - 2 events**

| Event                        | Location | Description               | File            |
| ---------------------------- | -------- | ------------------------- | --------------- |
| `navigation:request_demo:click` | Header   | "Request a demo" button | LandingLayout.tsx |
| `navigation:sign_in:click`      | Header   | "Sign in" button        | LandingLayout.tsx |

**Tracking topology:** `navigation:{object}:click`

---

**Contact Form - 5 events**

| Event                                  | Location      | Description                     | File            |
| -------------------------------------- | ------------- | ------------------------------- | --------------- |
| `contact:hubspot_form:ready`           | Contact page  | HubSpot form loaded successfully | HubSpotForm.tsx |
| `contact:hubspot_form:next_step`       | Contact form  | User clicks "Next" in form      | HubSpotForm.tsx |
| `contact:hubspot_form:previous_step`   | Contact form  | User clicks "Back" in form      | HubSpotForm.tsx |
| `contact:hubspot_form:submit`          | Contact form  | User submits contact form       | HubSpotForm.tsx |
| `contact:hubspot_form:script_load_error` | Contact page | Form script failed to load    | HubSpotForm.tsx |

**Tracking topology:** `contact:{object}:{action}`

**Note:** These events track the entire contact form lifecycle, from load to submission.

---

**Solutions Pages - 44 events (22 per section)**

All solution pages follow this pattern with 2 CTAs each (hero + footer):

| Page             | Hero Events                                       | Footer Events                                       | File                            |
| ---------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| Sales            | `solutions:sales_hero_cta_primary:click`          | `solutions:sales_footer_cta_primary:click`          | solutions/sales.tsx             |
|                  | `solutions:sales_hero_cta_secondary:click`        | `solutions:sales_footer_cta_secondary:click`        | HeroSection.tsx                 |
| Customer Support | `solutions:support_hero_cta_primary:click`        | `solutions:support_footer_cta_primary:click`        | solutions/customer-support.tsx  |
|                  | `solutions:support_hero_cta_secondary:click`      | `solutions:support_footer_cta_secondary:click`      | HeroSection.tsx                 |
| Marketing        | `solutions:marketing_hero_cta_primary:click`      | `solutions:marketing_footer_cta_primary:click`      | solutions/marketing.tsx         |
|                  | `solutions:marketing_hero_cta_secondary:click`    | `solutions:marketing_footer_cta_secondary:click`    | HeroSection.tsx                 |
| Data & Analytics | `solutions:data_hero_cta_primary:click`           | `solutions:data_footer_cta_primary:click`           | solutions/data-analytics.tsx    |
|                  | `solutions:data_hero_cta_secondary:click`         | `solutions:data_footer_cta_secondary:click`         | HeroSection.tsx                 |
| Engineering      | `solutions:engineering_hero_cta_primary:click`    | `solutions:engineering_footer_cta_primary:click`    | solutions/engineering.tsx       |
|                  | `solutions:engineering_hero_cta_secondary:click`  | `solutions:engineering_footer_cta_secondary:click`  | HeroSection.tsx                 |
| Productivity     | `solutions:productivity_hero_cta_primary:click`   | `solutions:productivity_footer_cta_primary:click`   | solutions/productivity.tsx      |
|                  | `solutions:productivity_hero_cta_secondary:click` | `solutions:productivity_footer_cta_secondary:click` | HeroSection.tsx                 |
| Knowledge        | `solutions:knowledge_hero_cta_primary:click`      | `solutions:knowledge_footer_cta_primary:click`      | solutions/knowledge.tsx         |
|                  | `solutions:knowledge_hero_cta_secondary:click`    | `solutions:knowledge_footer_cta_secondary:click`    | HeroSection.tsx                 |
| IT               | `solutions:it_hero_cta_primary:click`             | `solutions:it_footer_cta_primary:click`             | solutions/it.tsx                |
|                  | `solutions:it_hero_cta_secondary:click`           | `solutions:it_footer_cta_secondary:click`           | HeroSection.tsx                 |
| Legal            | `solutions:legal_hero_cta_primary:click`          | `solutions:legal_footer_cta_primary:click`          | solutions/legal.tsx             |
|                  | `solutions:legal_hero_cta_secondary:click`        | `solutions:legal_footer_cta_secondary:click`        | HeroSection.tsx                 |
| People           | `solutions:people_hero_cta_primary:click`         | `solutions:people_footer_cta_primary:click`         | solutions/recruiting-people.tsx |
|                  | `solutions:people_hero_cta_secondary:click`       | `solutions:people_footer_cta_secondary:click`       | HeroSection.tsx                 |
| Platform         | `solutions:platform_footer_cta_primary:click`     | `solutions:platform_footer_cta_secondary:click`     | solutions/dust-platform.tsx     |

**Tracking topology:** `solutions:{page}_{section}_cta_{type}:click`

**CTA Types:**

- Primary: Typically “Get Started” or “Try Dust” (highlight variant)
- Secondary: Typically “Talk to Sales” or “Request Demo” (outline variant)

---

**Industry Pages - 40 events (20 per section)**

All industry pages follow this pattern with 2 CTAs each (hero + footer):

| Page                | Hero Events                                       | Footer Events                                       | File                                  |
| ------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| B2B SaaS            | `industry:b2b_hero_cta_primary:click`             | `industry:b2b_footer_cta_primary:click`             | industry/b2b-saas.tsx                 |
|                     | `industry:b2b_hero_cta_secondary:click`           | `industry:b2b_footer_cta_secondary:click`           | IndustryTemplate.tsx                  |
| Financial Services  | `industry:financial_hero_cta_primary:click`       | `industry:financial_footer_cta_primary:click`       | industry/financial-services.tsx       |
|                     | `industry:financial_hero_cta_secondary:click`     | `industry:financial_footer_cta_secondary:click`     | IndustryTemplate.tsx                  |
| Insurance           | `industry:insurance_hero_cta_primary:click`       | `industry:insurance_footer_cta_primary:click`       | industry/insurance.tsx                |
|                     | `industry:insurance_hero_cta_secondary:click`     | `industry:insurance_footer_cta_secondary:click`     | IndustryTemplate.tsx                  |
| Marketplace         | `industry:marketplace_hero_cta_primary:click`     | `industry:marketplace_footer_cta_primary:click`     | industry/marketplace.tsx              |
|                     | `industry:marketplace_hero_cta_secondary:click`   | `industry:marketplace_footer_cta_secondary:click`   | IndustryTemplate.tsx                  |
| Retail & E-commerce | `industry:retail_hero_cta_primary:click`          | `industry:retail_footer_cta_primary:click`          | industry/retail-ecommerce.tsx         |
|                     | `industry:retail_hero_cta_secondary:click`        | `industry:retail_footer_cta_secondary:click`        | IndustryTemplate.tsx                  |
| Consulting          | `industry:consulting_hero_cta_primary:click`      | `industry:consulting_footer_cta_primary:click`      | industry/consulting.tsx               |
|                     | `industry:consulting_hero_cta_secondary:click`    | `industry:consulting_footer_cta_secondary:click`    | IndustryTemplate.tsx                  |
| Media               | `industry:media_hero_cta_primary:click`           | `industry:media_footer_cta_primary:click`           | industry/media.tsx                    |
|                     | `industry:media_hero_cta_secondary:click`         | `industry:media_footer_cta_secondary:click`         | IndustryTemplate.tsx                  |
| Energy & Utilities  | `industry:energy_hero_cta_primary:click`          | `industry:energy_footer_cta_primary:click`          | industry/energy-utilities.tsx         |
|                     | `industry:energy_hero_cta_secondary:click`        | `industry:energy_footer_cta_secondary:click`        | IndustryTemplate.tsx                  |
| Investment Firms    | `industry:investment_hero_cta_primary:click`      | `industry:investment_footer_cta_primary:click`      | industry/investment-firms.tsx         |
|                     | `industry:investment_hero_cta_secondary:click`    | `industry:investment_footer_cta_secondary:click`    | IndustryTemplate.tsx                  |
| Manufacturing       | `industry:manufacturing_hero_cta_primary:click`   | `industry:manufacturing_footer_cta_primary:click`   | industry/industrial-manufacturing.tsx |
|                     | `industry:manufacturing_hero_cta_secondary:click` | `industry:manufacturing_footer_cta_secondary:click` | IndustryTemplate.tsx                  |

**Tracking topology:** `industry:{page}_{section}_cta_{type}:click`

**CTA Types:**

- Primary: Typically “Get Started” or “Try Dust” (highlight variant)
- Secondary: Typically “Request a Demo” or “Talk to Sales” (outline variant)

---

### Stage 2: Evaluation (Anonymous → Identified)

**Pricing Page - 4 events**

| Event                                   | Location     | Description                  | Extra Attributes | File             |
| --------------------------------------- | ------------ | ---------------------------- | ---------------- | ---------------- |
| `pricing:hero_start_trial:click`        | Hero section | Start trial CTA              | -                | pricing.tsx      |
| `pricing:plan_card_start_trial:click`   | Plan cards   | Start trial button on card   | -                | pricing.tsx      |
| `pricing:plan_pro_select:click`         | Plan table   | Select Pro plan              | -                | PlansTables.tsx  |
| `pricing:plan_enterprise_contact:click` | Plan table   | Contact sales for Enterprise | -                | PlansTables.tsx  |

**Tracking topology:** `pricing:{object}:click`

**Note:** Pageviews are automatically tracked, including pricing page visits

---

### Stage 3: Account Creation & Onboarding

**Onboarding - 1 event**

| Event                            | Location     | Description                   | Extra Attributes | File        |
| -------------------------------- | ------------ | ----------------------------- | ---------------- | ----------- |
| `auth:onboarding_complete:click` | Welcome page | Complete name/job form        | -                | welcome.tsx |

**Additional tracking:**

- GTM `signup_completed` event also fires (legacy)
- WorkOS handles OAuth (Google, email, etc.) - not directly tracked
- User becomes **identified** at this point
- Plan properties **NOT YET SET** (no subscription)

**Tracking topology:** `auth:{object}:action`

---

### Stage 4: Subscription (First Conversion Point)

**Subscription Flow - 5 events**

| Event                                   | Location          | Description                        | Extra Attributes                                            | File                 |
| --------------------------------------- | ----------------- | ---------------------------------- | ----------------------------------------------------------- | -------------------- |
| `auth:subscription_start:click`         | Subscribe page    | Start trial or resume subscription | `billing_period` ("monthly", "yearly"), `is_trial` ("true", "false") | subscribe.tsx        |
| `auth:subscription_skip_trial:click`    | Subscription page | End trial early, pay now           | -                                                           | subscription/index.tsx |
| `auth:subscription_cancel_trial:click`  | Subscription page | Cancel free trial                  | -                                                           | subscription/index.tsx |
| `auth:subscription_manage:click`        | Subscription page | Open subscription management       | -                                                           | subscription/index.tsx |
| `auth:subscription_stripe_portal:click` | Subscription page | Open Stripe billing dashboard      | -                                                           | subscription/index.tsx |

**Payment Success:**

- Automatic pageview with query params: `?type=succeeded&plan_code=XXX`
- After this point, `plan_code`, `plan_name`, and `plan_type` properties are set
- User properties and workspace group properties are updated

**Tracking topology:** `auth:{object}:click`

---

### Stage 5: Data Connection (Activation Step 1)

**Data Sources - 2 events**

| Event                                   | Location        | Description                           | Extra Attributes                                     | File                      |
| --------------------------------------- | --------------- | ------------------------------------- | ---------------------------------------------------- | ------------------------- |
| `datasources:add_connection_menu:click` | Workspace page  | Open "Add Connections" menu           | -                                                    | AddConnectionMenu.tsx |
| `datasources:provider_select:click`     | Connection menu | Select provider (Notion, Slack, etc.) | `provider` (e.g., "notion", "slack", "google_drive") | AddConnectionMenu.tsx |

**Tracking topology:** `datasources:{object}:click`

**Provider values:**

- “notion”, “slack”, “google_drive”, “github”, “confluence”
- “intercom”, “microsoft”, “zendesk”, “salesforce”, “webcrawler”
- “gong”, “bigquery”, “snowflake”

---

### Stage 6: Assistant Creation (Activation Step 2)

**Assistant Builder - 5 events**

| Event                                | Location                      | Description                      | Extra Attributes                                     | File                      |
| ------------------------------------ | ----------------------------- | -------------------------------- | ---------------------------------------------------- | ------------------------- |
| `builder:create_menu:click`          | Assistant page                | Open create assistant menu       | -                                                    | CreateAgentButton.tsx     |
| `builder:create_from_scratch:click`  | Create menu                   | Create assistant from scratch    | -                                                    | CreateAgentButton.tsx     |
| `builder:create_from_template:click` | Create menu                   | Create from template             | -                                                    | CreateAgentButton.tsx     |
| `builder:manage_agents:click`        | Assistant page                | Open manage agents view          | -                                                    | AssistantBrowser.tsx      |
| `builder:create_agent:submit`        | Agent builder                 | Successfully created a new agent | `scope` ("private", "workspace"), `has_actions` (true/false) | submitAgentBuilderForm.ts |

**Extra Attributes Explained:**

- `scope` - Whether agent is private or workspace-wide
- `has_actions` - Whether agent has MCP actions configured

**Tracking topology:** `builder:{object}:action`

---

**Tools & MCP - 3 events**

| Event                        | Location        | Description                | Extra Attributes         | File             |
| ---------------------------- | --------------- | -------------------------- | ------------------------ | ---------------- |
| `tools:add_tools_menu:click` | Tools page      | Open "Add Tools" menu      | -                        | AddActionMenu.tsx |
| `tools:add_mcp_server:click` | Tools menu      | Click "Add MCP Server"     | -                        | AddActionMenu.tsx |
| `tools:tool_select:click`    | Tools menu      | Select a specific tool     | `tool_name` (string)     | AddActionMenu.tsx |

**Tracking topology:** `tools:{object}:click`

### Stage 7: First Conversation (FULL ACTIVATION)

**Conversation - 1 event (MOST IMPORTANT)**

| Event                              | Location         | Description                      | Extra Attributes                    | File |
| ---------------------------------- | ---------------- | -------------------------------- | ----------------------------------- | ---- |
| `conversation:message_send:submit` | API call success | Message successfully sent to API | `has_attachments` (boolean), `has_tools` (boolean), `has_agents` (boolean), `has_default_agent` (boolean), `has_custom_agent` (boolean), `is_new_conversation` (boolean), `agent_count` (number), `attachment_count` (number), `tool_count` (number) | InputBar.tsx |

**Extra Attributes Explained:**

- `has_attachments` - User attached data sources/files/content nodes to the message
- `has_tools` - User selected MCP tools for the message
- `has_agents` - User mentioned one or more agents
- `has_default_agent` - User used the default workspace agent
- `has_custom_agent` - User mentioned a custom/specific agent
- `is_new_conversation` - This is the first message in a new conversation
- `agent_count` - Number of agents mentioned in the message
- `attachment_count` - Number of attachments included
- `tool_count` - Number of MCP tools selected

**FULL ACTIVATION Criteria:**
User sent a message where:

- `has_attachments = true` OR
- `has_tools = true`

This indicates they're using a **complex agent** with knowledge/tools, not just a basic chat.

**Tracking topology:** `conversation:{object}:action`

**Note:** This event tracks successful message delivery (API success), ensuring we only count messages that were actually sent, not failed attempts.

---

## Key Funnels & Metrics

### Primary Activation Funnel

```
Stage 1: Discovery & Evaluation
├─ home:hero_get_started:click
├─ solutions:{page}_hero_cta_primary:click (any solution page)
├─ industry:{page}_hero_cta_primary:click (any industry page)
├─ pricing:plan_pro_select:click
├─ contact:hubspot_form:submit
│
Stage 2: Signup & Onboarding
├─ $pageview /w/[wId]/welcome (onboarding page load)
├─ auth:onboarding_complete:click (form submit)
│
Stage 3: Subscription (First Conversion Point)
├─ auth:subscription_start:click (billing_period, is_trial)
├─ $pageview ?type=succeeded (payment success)
│
Stage 4: Setup
├─ datasources:provider_select:click (provider)
├─ tools:tool_select:click (optional - MCP tools)
├─ builder:create_agent:submit (agent created)
│
Stage 5: ACTIVATION
└─ conversation:message_send:submit (has_attachments=true OR has_tools=true)

```

### Key Metrics to Track

**1. Activation Rate**

```
Users with conversation:message_send:submit
WHERE (has_attachments=true OR has_tools=true)
÷
Users with auth:onboarding_complete:click

```

**2. Onboarding Completion Rate**

```
Users with auth:onboarding_complete:click
÷
Users with $pageview /w/[wId]/welcome

```

**3. Agent Creation Rate**

```
Users with builder:create_agent:submit
÷
Users with auth:subscription_start:click

```

**4. Activation Rate by Plan**

```
Same as #1, filtered by plan_code or plan_type

```

**5. Time to Activation**

```
Time between:
  First: $pageview /w/[wId]/welcome
  Second: conversation:message_send:submit WHERE (has_attachments=true OR has_tools=true)

```

**6. Trial Conversion Rate**

```
Users with $pageview containing type=succeeded
÷
Users with auth:subscription_start:click WHERE is_trial="true"

```

**7. Data Source Adoption**

```
Count of datasources:provider_select:click
GROUP BY provider attribute

```

**8. MCP Tools Adoption**

```
Count of tools:tool_select:click
GROUP BY tool_name attribute

```

**9. Contact Form Conversion**

```
Users with contact:hubspot_form:submit
÷
Users with contact:hubspot_form:ready

```

**10. Drop-off Analysis (Primary Funnel)**

```
Funnel visualization showing drop-off at each stage:
1. $pageview /w/[wId]/welcome (Onboarding page load)
2. auth:onboarding_complete:click (Onboarding completed)
3. auth:subscription_start:click (Paywall passed)
4. $pageview ?type=succeeded (Payment success)
5. datasources:provider_select:click (Connected data)
6. builder:create_agent:submit (Agent created)
7. conversation:message_send:submit (First message sent)
8. conversation:message_send:submit WHERE (has_attachments=true OR has_tools=true) (Activated)

```

---

## Activation Definition

### What is "Full Activation"?

A user is **fully activated** when they send a message with a **complex agent**:

**Technical criteria:**

```jsx
conversation:message_send:submit
WHERE (has_attachments = true OR has_tools = true)
```

**Why this matters:**

- Simple chat = Low engagement, high churn
- Complex agent = High engagement, demonstrates value, low churn
- Complex agents require setup (data sources, tools, knowledge)
- If users do the setup, they see the value
- Using `message_send:submit` ensures the message was successfully delivered (not just clicked)

### Activation Cohorts

**Create these cohorts in PostHog:**

```jsx
// Fully Activated Users
Users who performed:
  Event: conversation:message_send:submit
  Where: has_attachments = true OR has_tools = true
  At least: 1 time

// Trial Users Who Activated
Same as above
Filter: is_trial = "true"

// Pro Users Who Activated Within 7 Days
Event: conversation:message_send:submit (has_attachments=true OR has_tools=true)
Within: 7 days of $pageview /w/[wId]/welcome
Filter: plan_type = "PRO"

// Enterprise Users
Filter: plan_type = "ENTERPRISE"
```

---

## Appendix: Event Attribute Reference

### Event Attributes

All events include base attributes:

- Event name format: `{area}:{object}:{action}` (e.g., "home:hero_get_started:click")
- `area` - Section (e.g., "home", "solutions", "industry", "auth", "conversation")
- `object` - Element (e.g., "sales_hero_cta_primary", "message_send")
- `action` - Action type (usually "click", "submit", "create", etc.)

### Tracking Areas

The following areas are defined in `front/lib/tracking.ts`:

**Public Pages:**

- `home` - Homepage
- `solutions` - All solution pages (sales, support, marketing, etc.)
- `industry` - All industry pages (B2B SaaS, financial services, etc.)
- `pricing` - Pricing page
- `contact` - Contact/demo request forms
- `auth` - Authentication & onboarding
- `navigation` - Global navigation (header CTAs)

**Product:**

- `conversation` - Conversation interactions
- `builder` - Assistant builder
- `datasources` - Data source management
- `tools` - MCP tools and actions
- `workspace` - Workspace settings
- `spaces` - Spaces management
- `settings` - User settings
- `labs` - Labs features

### Extra Attributes by Event

**Subscription:**

- `billing_period`: “monthly” | “yearly”
- `is_trial`: “true” | “false”

**Data Sources:**

- `provider`: String (notion, slack, google_drive, github, etc.)

**Conversation:**

- `has_attachments`: boolean - User included data source attachments
- `has_tools`: boolean - User selected MCP tools
- `has_agents`: boolean - User mentioned any agents
- `has_default_agent`: boolean - User used default workspace agent
- `has_custom_agent`: boolean - User mentioned custom agents
- `is_new_conversation`: boolean - First message in new conversation
- `agent_count`: number - Number of agents mentioned
- `attachment_count`: number - Number of attachments
- `tool_count`: number - Number of tools selected

**Builder:**

- `scope`: "private" | "workspace" - Agent visibility
- `has_actions`: boolean - Agent has MCP actions configured

**Tools:**

- `tool_name`: string - Name of the MCP server/tool selected

### User Properties (Always Available)

- `workspace_id`: String - Current workspace identifier

### Workspace Group Properties (Always Available)

These properties are set at the workspace level and available on all events:

- `plan_code`: String (e.g., "PRO_PLAN_SEAT_29")
- `plan_name`: String (e.g., "Pro")
- `plan_type`: String - "ENTERPRISE" | "PRO" | "FREE" | "OTHER"
- `is_trial`: "true" | "false"

---
