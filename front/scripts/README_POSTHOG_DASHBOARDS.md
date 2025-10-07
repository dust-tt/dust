# PostHog Dashboard Setup

This script automatically creates PostHog dashboards for tracking the Dust user journey.

## Quick Start

```bash
# Set environment variables
export POSTHOG_API_KEY="phx_your_key_here"
export POSTHOG_PROJECT_ID="12345"

# Run the script (dry run first)
cd front
npx tsx scripts/create_posthog_dashboards.ts

# Actually create the dashboards
npx tsx scripts/create_posthog_dashboards.ts --execute
```

## Getting Credentials

### 1. Get your PostHog API Key

- Go to PostHog → **Settings** → **Personal API Keys**
- Click "Create personal API key"
- Give it a name (e.g., "Dashboard Creator")
- Copy the key (starts with `phx_`)

### 2. Find your Project ID

- Look at your PostHog URL: `https://us.posthog.com/project/{PROJECT_ID}/...`
- Copy the numeric project ID

### 3. Optional: EU Instance

If you're using the EU instance:

```bash
export POSTHOG_HOST="https://eu.posthog.com"
```

## What Gets Created

The script creates **8 comprehensive dashboards** covering the entire user journey (109 tracked events):

### 1. 🎯 Conversion Overview Dashboard (7 insights)

Tracks key metrics through the entire user journey:

- **1️⃣ Onboarding Starts** - `auth:onboarding_start_view`
- **2️⃣ Onboarding Completions** - `auth:onboarding_complete_click`
- **3️⃣ Paywall Passed** - `auth:subscription_start_click`
- **4️⃣ Subscribers** - Payment success pageview
- **5️⃣ Agents Created** - `builder:agent_create_submit`
- **6️⃣ First Messages** - `conversation:message_send_submit`
- **7️⃣ ⭐ Activated Users** - Messages with attachments or MCP

### 2. 📉 Drop-off Analysis Dashboard (5 funnels)

Funnel analysis showing where users drop off:

- **Complete Activation Funnel** - All 7 steps from onboarding to activation
- **Funnel by Plan Type** - Breakdown by plan_name
- **Early Drop-off: Paywall** - Onboarding → Subscription
- **Mid Drop-off: Agent Creation** - Subscription → Agent Created
- **Late Drop-off: Activation** - Agent Created → Activated

### 3. ⏱️ Time to Value Dashboard (2+ insights)

How quickly users reach key milestones:

- **Activation Rate by Plan** - Breakdown by plan type
- **Most Popular Data Sources** - Provider selection breakdown
- **⚠️ Manual setup required:** Time-to-event percentiles (see below)

### 4. 🎯 Marketing Performance Dashboard (5 insights)

Track landing page performance across all marketing pages:

- **🏠 Homepage CTAs** - Get Started, Book Demo, Try Dust, Request Demo
- **💰 Pricing Page** - Start Trial, Select Pro, Contact Enterprise
- **🎯 Solutions Pages** - 11 solution pages (sales, support, marketing, data, engineering, productivity, knowledge, IT, legal, people, platform) - 44 events
- **🏭 Industry Pages** - 10 industry pages (B2B SaaS, financial, insurance, marketplace, retail, consulting, media, energy, investment, manufacturing) - 40 events
- **🚀 Marketing → Signup Funnel** - Landing CTA → Onboarding → Subscription

**Answers:** Which landing pages convert best? Which solution/industry pages drive the most signups?

### 5. 📊 Data Source Adoption Dashboard (4 insights)

Track which data sources users connect:

- **🔌 Connection Menu Opens** - How many users try to connect data sources
- **🏆 Most Popular Providers** - Breakdown by provider (Notion, Slack, Google Drive, GitHub, etc.)
- **📈 Connection Funnel** - Subscribed → Menu opened → Provider selected → Agent created
- **📊 Providers by Plan** - Which plans use which data sources

**Answers:** Most popular data source? Provider preferences by plan? Where do users drop off?

### 6. 🔨 Builder Engagement Dashboard (5 insights)

Track assistant creation patterns:

- **➕ Builder Actions** - Create menu, from scratch, from template, agent created
- **🌐 Agent Scope** - Private vs workspace agents
- **⚡ Agents with MCP** - Agents with vs without actions
- **🎯 Builder Funnel** - Menu → Agent created → First message
- **📊 Creation by Plan** - Which plans create the most agents

**Answers:** Template vs scratch preference? % of agents with MCP? Creation rate by plan?

### 7. 💬 Conversation Engagement Dashboard (4 insights)

Track conversation patterns and activation signals:

- **📨 Message Types** - All messages vs complex (activated) messages
- **🎯 Features Used** - Attachments, MCP tools, mentions
- **🆕 New Conversations** - Conversation creation rate
- **⭐ Activation by Plan** - Complex message breakdown

**Answers:** % of complex messages? Which features drive engagement? Activation rate by plan?

### 8. 🎯 Trial Analysis Dashboard (4 insights)

Track trial user behavior and conversion:

- **🚀 Trial Events** - Started, skipped, cancelled
- **💳 Trial → Paid Funnel** - Trial conversion rate
- **⭐ Trial → Activation** - How many trials activate
- **📅 Billing Period** - Monthly vs yearly preference

**Answers:** Trial conversion rate? Trial activation rate? Billing preference?

## Manual Steps Required

Time-to-event insights can't be fully created via the API. After running the script:

1. Go to the **"⏱️ Time to Value"** dashboard
2. Click **"Add insight"**
3. Select **"Time to event"** query type
4. Configure:
   - **First event:** `auth:onboarding_start_view`
   - **Second event:** `conversation:message_send_submit`
   - **Filter second event:** `has_attachments = true OR has_mcp = true`
   - **Breakdown by:** `plan_name` (person property)
   - **Show percentiles:** P25, P50 (median), P75
5. Name it: **"⏱️ Time to Activation by Plan"**
6. Save to dashboard

## CLI Options

```bash
cd front
npx tsx scripts/create_posthog_dashboards.ts \
  --apiKey "phx_..." \           # Or use POSTHOG_API_KEY env var
  --projectId "12345" \          # Or use POSTHOG_PROJECT_ID env var
  --host "https://us.posthog.com" \  # Or use POSTHOG_HOST env var
  --execute                      # Actually create (omit for dry run)
```

## Answering Key Questions

Once dashboards are created, you can answer comprehensive questions across the entire user journey:

### 🎯 Discovery & Marketing

- **Which landing pages convert best?**
  → Marketing Performance: Compare homepage, solutions, and industry page CTAs
- **Which solution/industry pages drive the most signups?**
  → Marketing Performance: "Marketing Page → Signup Funnel"
- **Do pricing page visitors convert better?**
  → Compare pricing events vs other landing page funnels

### 💳 Conversion & Onboarding

- **How many users drop at the paywall?**
  → Drop-off Analysis: "Early Drop-off: Paywall" funnel
- **What % of signups fully activate?**
  → Drop-off Analysis: "Complete Activation Funnel" (last step %)
- **How many trials convert to paid?**
  → Trial Analysis: "Trial → Paid Conversion"

### 🔨 Product Activation

- **How many users pass paywall but never create an agent?**
  → Drop-off Analysis: "Mid Drop-off: Agent Creation"
- **How many create an agent but never send a message?**
  → Drop-off Analysis: "Late Drop-off: Activation"
- **Do users prefer templates or building from scratch?**
  → Builder Engagement: "Builder Actions"
- **What's the most popular data source?**
  → Data Source Adoption: "Most Popular Providers"

### 💬 Engagement & Retention

- **What % of messages use complex features?**
  → Conversation Engagement: "Message Types" (complex vs simple)
- **Which features drive engagement?**
  → Conversation Engagement: "Message Features Used" (attachments, MCP, mentions)
- **Which plan tier activates fastest?**
  → Time to Value: Manual time-to-event insight
- **Which plans have highest activation rates?**
  → Multiple dashboards: "Activation by Plan" breakdowns

### 📊 Business Metrics

- **What % of trial users activate?**
  → Trial Analysis: "Trial → Activation" funnel
- **Do users prefer monthly or yearly billing?**
  → Trial Analysis: "Billing Period Preference"
- **Which data sources do enterprise customers prefer?**
  → Data Source Adoption: "Providers by Plan"
- **What % of agents use MCP actions?**
  → Builder Engagement: "Agents with MCP Actions"

## Troubleshooting

### Error: 401 Unauthorized

**Solution:** Check your API key has the correct permissions

- Go to PostHog → Settings → Personal API Keys
- Verify the key exists and hasn't expired
- Make sure you copied the full key

### Error: 404 Not Found

**Solution:** Verify your project ID

- Check the URL in PostHog: `/project/{ID}/...`
- Ensure you're using the numeric ID, not a slug

### Error: Property filters not working

Some property filter formats may not be fully supported by the API. You can:

1. Let the script create the basic insight
2. Edit it in the PostHog UI to add complex filters

## Related Files

- **Event definitions:** `/front/lib/tracking.ts`
- **Event documentation:** `/USER_JOURNEY.md`
- **PostHog integration:** `/front/components/app/PostHogTracker.tsx`

## Summary

**What you get:**

- ✅ **8 comprehensive dashboards** automatically created
- ✅ **40+ insights** tracking the complete user journey
- ✅ **109 unique events** covered (homepage → solutions → industry → pricing → onboarding → subscription → data sources → agents → conversations)
- ✅ **Multiple funnels** showing drop-off at every stage
- ✅ **Plan-level breakdowns** for all key metrics
- ✅ **Marketing attribution** across all landing pages

**Key assumptions:**

- Dashboards are created as **pinned** by default
- All funnels use a **30-day conversion window**
- Activation = message with `has_attachments=true` OR `has_mcp=true`
- Plan breakdowns require `plan_name` person property in PostHog
- Some complex property filters may need manual adjustment in PostHog UI

**Event coverage:**

- **Stage 1 - Discovery:** 92 events (home, solutions, industry, pricing pages)
- **Stage 2 - Onboarding:** 2 events (start, complete)
- **Stage 3 - Subscription:** 5 events (trial, payment, management)
- **Stage 4 - Setup:** 6 events (data sources, builder actions)
- **Stage 5 - Activation:** 1 event (complex message) with rich attributes

**Time to run:** ~2-3 minutes to create all 8 dashboards
