# PostHog Dashboards: Complete User Journey Analytics

**Last Updated:** January 2025  
**Owner:** Product Growth Team  
**PostHog Project:** [Link to your PostHog project]

---

## Overview

We track **109 unique events** across the entire user journey, from first landing page visit to full product activation. Our PostHog dashboards provide complete visibility into user behavior, conversion patterns, and product engagement.

### Quick Stats

- 📊 **8 comprehensive dashboards**
- 📈 **40+ insights** with automatic updates
- 🎯 **7-stage user journey** fully instrumented
- 🔍 **Plan-level breakdowns** for all key metrics

---

## Dashboard Index

| Dashboard                                                | Purpose                              | Key Questions Answered           |
| -------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| [1. Conversion Overview](#1-conversion-overview)         | Track the complete activation funnel | What % of users fully activate?  |
| [2. Drop-off Analysis](#2-drop-off-analysis)             | Identify where users get stuck       | Where are the biggest drop-offs? |
| [3. Time to Value](#3-time-to-value)                     | Measure activation speed             | How quickly do users activate?   |
| [4. Marketing Performance](#4-marketing-performance)     | Evaluate landing page effectiveness  | Which pages convert best?        |
| [5. Data Source Adoption](#5-data-source-adoption)       | Track data source connections        | Most popular data sources?       |
| [6. Builder Engagement](#6-builder-engagement)           | Monitor agent creation patterns      | Template vs scratch preference?  |
| [7. Conversation Engagement](#7-conversation-engagement) | Analyze message quality & features   | What % use complex features?     |
| [8. Trial Analysis](#8-trial-analysis)                   | Track trial conversions              | Trial → paid conversion rate?    |

---

## 1. Conversion Overview

**Purpose:** Track key metrics through the entire user journey from onboarding to activation.

### Key Metrics (7 Insights)

1. **1️⃣ Onboarding Starts** - Users who land on the onboarding page
2. **2️⃣ Onboarding Completions** - Users who complete the signup form
3. **3️⃣ Paywall Passed** - Users who click to start subscription
4. **4️⃣ Subscribers** - Users with successful payment
5. **5️⃣ Agents Created** - Users who create their first assistant
6. **6️⃣ First Messages** - Users who send their first message
7. **7️⃣ ⭐ Activated Users** - Users who send complex messages (with attachments or MCP tools)

### How to Use

**Weekly Check:**

- Monitor the 7 metrics trending over time
- Look for unusual drops or spikes
- Compare current week vs previous weeks

**Key KPIs:**

- **Activation Rate** = (Step 7 ÷ Step 1) × 100
- **Onboarding Completion Rate** = (Step 2 ÷ Step 1) × 100
- **Payment Success Rate** = (Step 4 ÷ Step 3) × 100

**Red Flags:**

- ⚠️ Sudden drop in any metric (>20% week-over-week)
- ⚠️ Activation rate trending downward
- ⚠️ Growing gap between subscribers and agents created

### Success Criteria

- ✅ **Activation Rate >30%** - Industry benchmark for SaaS products
- ✅ **Onboarding Completion >70%** - Good signup flow
- ✅ **Payment Success >90%** - Healthy payment processing

---

## 2. Drop-off Analysis

**Purpose:** Identify exactly where users drop off in the journey and by how much.

### Key Funnels (5 Insights)

1. **🔍 Complete Activation Funnel** - All 7 steps, shows drop-off % at each stage
2. **📊 Funnel by Plan Type** - Compare Pro vs Enterprise behavior
3. **🚪 Early Drop-off: Paywall** - Onboarding → Subscription (critical!)
4. **🔨 Mid Drop-off: Agent Creation** - Subscription → Agent Created
5. **💬 Late Drop-off: Activation** - Agent Created → Complex Message

### How to Use

**Monthly Deep Dive:**

1. Open "Complete Activation Funnel"
2. Note the % completion at each step
3. Identify the **biggest drop-off** (lowest %)
4. Investigate causes (UX issues, unclear value prop, technical problems)
5. Plan experiments to improve that step

**Funnel by Plan Analysis:**

- Compare conversion rates between plan types
- Identify if certain plans have better/worse activation
- Adjust onboarding flow per plan if needed

**Cohort Analysis:**

- Change date range to specific cohorts (e.g., "Users who signed up in January")
- Compare cohort performance over time
- Track if product changes improve activation

### Success Criteria

- ✅ **Onboarding → Subscription: >50%** - Half of users should pass paywall
- ✅ **Subscription → Agent Created: >80%** - Most subscribers should create an agent
- ✅ **Agent Created → Activated: >60%** - Most should use complex features

### Action Items When Drop-off is High

**Paywall Drop-off (>50%):**

- Review pricing page clarity
- Test different trial lengths
- Add social proof/testimonials
- Simplify payment flow

**Agent Creation Drop-off (>30%):**

- Improve onboarding guidance
- Add more templates
- Create quick-start tutorials
- Send activation emails

**Activation Drop-off (>40%):**

- Highlight data source connections in UI
- Add in-app prompts for attachments
- Create tutorial for MCP tools
- Send feature discovery emails

---

## 3. Time to Value

**Purpose:** Measure how quickly users reach activation and which plans activate fastest.

### Key Metrics (2+ Insights)

1. **📈 Activation Rate by Plan** - Daily active users who are activated, broken down by plan
2. **📊 Most Popular Data Sources** - Which providers users connect (Notion, Slack, etc.)
3. **⏱️ Time to Activation** (Manual setup required) - Median time from signup to activation

### How to Use

**Compare Plans:**

- See which plan types have the highest activation rates
- Use this data for pricing/packaging decisions
- Identify if enterprise customers need different onboarding

**Data Source Strategy:**

- Identify most popular data sources
- Prioritize integrations based on usage
- Create targeted content for top data sources

**Speed to Value:**

- Track median time to activation
- Set goals to reduce this time
- Test onboarding changes to speed up activation

### Success Criteria

- ✅ **Median time to activation: <7 days** - Users should see value quickly
- ✅ **P75 time to activation: <14 days** - Even slower users activate within 2 weeks
- ✅ **Top 3 data sources: >80% of connections** - Focus on what users want

---

## 4. Marketing Performance

**Purpose:** Track which landing pages and CTAs drive the most conversions.

### Key Metrics (5 Insights)

1. **🏠 Homepage CTA Clicks** - Get Started, Book Demo, Try Dust, Request Demo
2. **💰 Pricing Page Actions** - Start Trial, Select Pro, Contact Enterprise
3. **🎯 Solutions Pages** - Clicks on all 11 solution pages (Sales, Support, Marketing, etc.)
4. **🏭 Industry Pages** - Clicks on all 10 industry pages (B2B SaaS, Financial, etc.)
5. **🚀 Marketing → Signup Funnel** - Full journey from CTA to subscription

### How to Use

**Monthly Marketing Review:**

1. Identify which CTAs get the most clicks
2. Calculate conversion rates for each landing page
3. Optimize underperforming pages
4. Double down on high-converting content

**A/B Test Validation:**

- Use event data to validate landing page experiments
- Compare before/after metrics for page changes
- Track impact of new solution/industry pages

**Content Strategy:**

- See which solution pages drive most signups → Create more content
- Identify low-traffic industry pages → Consider deprecating or improving
- Track CTA effectiveness → Optimize copy/design

### Success Criteria

- ✅ **Homepage → Signup: >15%** - Strong homepage conversion
- ✅ **Solutions pages total clicks: >200/week** - Good content engagement
- ✅ **Industry pages total clicks: >100/week** - Industry content resonating

### Key Comparisons

**Primary vs Secondary CTAs:**

- Primary (Get Started, Try Dust) should convert 3-5x higher than secondary
- If secondary CTAs outperform, consider swapping them

**Hero vs Footer CTAs:**

- Hero section CTAs typically convert 2-3x higher
- Track both to see if users scroll before converting

---

## 5. Data Source Adoption

**Purpose:** Understand which data sources users connect and where they drop off.

### Key Metrics (4 Insights)

1. **🔌 Connection Menu Opens** - How many users try to connect data sources
2. **🏆 Most Popular Providers** - Notion, Slack, Google Drive, GitHub, etc.
3. **📈 Connection Funnel** - Subscribed → Menu → Provider → Agent Created
4. **📊 Providers by Plan** - Which plans prefer which data sources

### How to Use

**Product Roadmap:**

- Prioritize integrations for top providers
- Identify gaps (high demand, not supported)
- Plan deprecation of unused integrations

**Onboarding Optimization:**

- If many users open menu but don't connect → Add guidance
- If specific provider has low completion → Fix integration issues
- Track drop-off in connection flow → Improve OAuth flow

**Plan-based Insights:**

- See if Enterprise customers prefer different data sources
- Customize onboarding recommendations by plan
- Create plan-specific documentation

### Success Criteria

- ✅ **Menu open rate: >70% of subscribers** - Most users try to connect data
- ✅ **Provider selection rate: >80% of menu opens** - Users find what they need
- ✅ **Top 5 providers: >90% of selections** - Clear winners exist

### Action Items

**Low Menu Open Rate:**

- Add prominent "Connect Data" prompts in UI
- Send activation emails highlighting data sources
- Create tutorials showing value of connections

**Low Provider Selection Rate:**

- Improve provider search/filtering
- Add more popular integrations
- Show usage statistics in the UI

---

## 6. Builder Engagement

**Purpose:** Track assistant creation patterns and identify friction in the builder.

### Key Metrics (5 Insights)

1. **➕ Builder Actions** - Create menu opens, from scratch, from template, agents created
2. **🌐 Agent Scope** - Private vs workspace agents
3. **⚡ Agents with MCP** - % of agents using MCP actions
4. **🎯 Builder Funnel** - Menu → Agent Created → First Message
5. **📊 Creation by Plan** - Which plans create the most agents

### How to Use

**Product Development:**

- If template usage is high → Create more templates
- If scratch usage is high → Improve blank canvas experience
- Track MCP adoption → Invest in MCP features

**Builder UX:**

- Monitor funnel drop-off from menu to creation
- If drop-off is high → Simplify builder UI
- Track time in builder (manual analysis) → Identify confusion

**Feature Adoption:**

- See what % of agents use MCP actions
- Set goals to increase MCP adoption
- Create content highlighting MCP value

### Success Criteria

- ✅ **Menu → Creation: >60%** - Most who start, finish
- ✅ **Creation → First Message: >80%** - Agents get used immediately
- ✅ **MCP adoption: >30%** - Advanced features being used

### Insights

**Template vs Scratch:**

- High template usage = Users want guidance
- High scratch usage = Users are power users or templates don't fit

**Private vs Workspace:**

- High private usage = Users experimenting
- High workspace usage = Team collaboration happening

---

## 7. Conversation Engagement

**Purpose:** Measure message quality and feature usage to understand true product engagement.

### Key Metrics (4 Insights)

1. **📨 Message Types** - All messages vs complex messages (with attachments/MCP)
2. **🎯 Features Used** - Breakdown of attachments, MCP tools, mentions
3. **🆕 New Conversations** - Rate of new conversation creation
4. **⭐ Activation by Plan** - Complex message usage by plan type

### How to Use

**Activation Quality:**

- Calculate: (Complex Messages ÷ Total Messages) × 100
- Track this ratio over time
- Goal: Increase % of complex messages

**Feature Discovery:**

- See which features are most used
- If attachments >> MCP → Promote MCP features
- If mentions are low → Improve assistant discovery

**Engagement Depth:**

- Track new conversations per user
- High rate = High engagement
- Low rate = Users not finding value or stuck

### Success Criteria

- ✅ **Complex message ratio: >40%** - Users using advanced features
- ✅ **MCP usage: >20% of messages** - Power features being adopted
- ✅ **New conversations: >5 per user per week** - High engagement

### Red Flags

- ⚠️ **Declining complex message ratio** - Users reverting to simple use
- ⚠️ **Single conversation per user** - Not exploring product
- ⚠️ **Low attachment usage** - Not connecting knowledge

---

## 8. Trial Analysis

**Purpose:** Track trial user behavior and optimize trial-to-paid conversion.

### Key Metrics (4 Insights)

1. **🚀 Trial Events** - Started, skipped (paid immediately), cancelled
2. **💳 Trial → Paid Funnel** - Conversion rate from trial to subscription
3. **⭐ Trial → Activation** - How many trial users fully activate
4. **📅 Billing Period** - Monthly vs yearly preference

### How to Use

**Trial Optimization:**

- Track trial → paid conversion rate
- Set benchmarks (industry standard: 15-25%)
- A/B test trial length, features, pricing

**Activation in Trial:**

- Monitor what % of trials activate (use complex features)
- Activated trials convert 3-5x better
- Focus on driving trial activation

**Billing Insights:**

- See preference for monthly vs yearly
- Adjust pricing page based on preference
- Offer incentives for preferred billing period

### Success Criteria

- ✅ **Trial → Paid: >20%** - Healthy trial conversion
- ✅ **Trial activation: >50%** - Users seeing value in trial
- ✅ **Trial cancellation: <30%** - Most trials complete

### Action Items

**Low Trial Conversion:**

- Send activation emails during trial
- Add in-app upgrade prompts
- Create trial success playbook
- Offer onboarding calls

**Low Trial Activation:**

- Simplify onboarding for trial users
- Pre-configure templates
- Send feature discovery emails
- Add trial countdown/urgency

**High Cancellation:**

- Survey cancelled users
- Identify friction points
- Test different trial lengths
- Improve trial experience

---

## Best Practices

### Daily Review (5 minutes)

- [ ] Check Conversion Overview for yesterday's signups
- [ ] Look for any anomalies or spikes
- [ ] Note any metric >20% change from previous day

### Weekly Review (30 minutes)

- [ ] Review all 7 key metrics in Conversion Overview
- [ ] Check Drop-off Analysis for new bottlenecks
- [ ] Review Marketing Performance for top-performing pages
- [ ] Note trends and share with team

### Monthly Deep Dive (2 hours)

- [ ] Full funnel analysis in Drop-off Analysis
- [ ] Compare current month vs previous month
- [ ] Analyze Time to Value by plan type
- [ ] Review Data Source Adoption trends
- [ ] Assess Builder and Conversation engagement
- [ ] Calculate and report trial metrics
- [ ] Create action items for next month

### Quarterly Strategy (Half day)

- [ ] Comprehensive review of all dashboards
- [ ] Identify 3-5 key improvement areas
- [ ] Set quarterly goals for each dashboard
- [ ] Plan experiments and A/B tests
- [ ] Update success criteria if needed

---

## Key Formulas & Calculations

### Activation Rate

```
(Users with Complex Messages ÷ Users who Started Onboarding) × 100
Target: >30%
```

### Paywall Conversion

```
(Users who Subscribed ÷ Users who Clicked Subscribe) × 100
Target: >90%
```

### Agent Creation Rate

```
(Users who Created Agent ÷ Paying Users) × 100
Target: >80%
```

### Complex Message Ratio

```
(Complex Messages ÷ Total Messages) × 100
Target: >40%
```

### Trial Conversion Rate

```
(Trials who Paid ÷ Trials Started) × 100
Target: >20%
```

### Time to Activation (Median)

```
Median time between Onboarding Start and first Complex Message
Target: <7 days
```

---

## Glossary

**Activation:** User sends a message with attachments OR MCP tools (not just a simple chat)

**Complex Message:** Message that uses advanced features (attachments, MCP tools, or data sources)

**Onboarding Start:** User lands on the `/welcome` page after OAuth signup

**Paywall Passed:** User clicks to start subscription (may or may not complete payment)

**MCP:** Model Context Protocol - advanced tools that agents can use

**Agent Scope:** Private (only creator can use) vs Workspace (team can use)

**Plan Types:** Free trial, Pro (self-serve), Enterprise (sales-led)

**Data Source Providers:** Notion, Slack, Google Drive, GitHub, Confluence, etc.

**Conversion Window:** Time period users have to complete funnel steps (we use 30 days)

---

## Dashboard Links

> **Note:** Replace these with your actual PostHog dashboard URLs after creation

- [Conversion Overview](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Drop-off Analysis](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Time to Value](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Marketing Performance](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Data Source Adoption](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Builder Engagement](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Conversation Engagement](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)
- [Trial Analysis](https://posthog.com/project/YOUR_PROJECT/dashboard/XXX)

---

## Technical Details

**Event Tracking Implementation:**

- Location: `/front/lib/tracking.ts`
- Helper functions: `withTracking()`, `TRACKING_AREAS`
- Event naming: `{area}:{object}_{action}` (e.g., `solutions:sales_hero_cta_primary_click`)

**User Properties:**

- `workspace_id` - Workspace identifier
- `plan_name` - Pro, Enterprise, etc.
- `plan_code` - Detailed plan SKU
- `is_trial` - "true" or "false"

**Event Attributes:**

- All events include: `tracking`, `area`, `object`, `action`
- Message events include: `has_attachments`, `has_mcp`, `has_mentions`, `is_new_conversation`
- Subscription events include: `billing_period`, `is_trial`
- Data source events include: `provider`
- Agent events include: `scope`, `has_actions`

**Dashboard Creation:**

- Script: `/front/scripts/create_posthog_dashboards.ts`
- Run: `npx tsx scripts/create_posthog_dashboards.ts --execute`
- Requires: `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` env variables

---

## Support & Questions

**For dashboard issues:**
Contact the Growth team or check `/front/scripts/README_POSTHOG_DASHBOARDS.md`

**For new event requests:**
Add events using `withTracking()` helper in `/front/lib/tracking.ts`

**For custom analyses:**
PostHog supports custom queries, cohorts, and additional dashboards - reach out to the data team

---

## Changelog

**January 2025:**

- ✅ Created all 8 comprehensive dashboards
- ✅ Added tracking for 109 unique events
- ✅ Implemented complete user journey tracking
- ✅ Added Solutions pages (44 events)
- ✅ Added Industry pages (40 events)
- ✅ Added builder, conversation, and trial analytics
