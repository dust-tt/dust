import {
  ClipboardCheckIcon,
  DocumentTextIcon,
  MagicIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

type SparkleIcon = ComponentType<{
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}>;

export interface DemoExchange {
  question: string;
  answer: string;
}

export interface AgentConfig {
  id: string;
  title: string;
  description: string;
  icon: SparkleIcon;
  colorClasses: {
    bg: string;
    icon: string;
    cardHover: string;
    tag: string;
  };
  tags: string[];
  href: string;
  seo: {
    title: string;
    description: string;
  };
  demoExchanges: DemoExchange[];
}

export const AGENTS: AgentConfig[] = [
  {
    id: "sop-generator",
    title: "Free SOP Generator",
    description:
      "Turn any process into a clear, structured Standard Operating Procedure. Describe your workflow, get a production-ready document.",
    icon: DocumentTextIcon,
    colorClasses: {
      bg: "bg-golden-100",
      icon: "text-golden-700",
      cardHover: "hover:bg-golden-50",
      tag: "bg-golden-100 text-golden-700",
    },
    tags: ["Operations", "Documentation"],
    href: "/home/agents/sop-generator",
    seo: {
      title: "Free SOP Generator AI Agent | Dust",
      description:
        "Turn any process into a clear, structured Standard Operating Procedure with AI. Free and ready to use on Dust.",
    },
    demoExchanges: [
      {
        question: "Generate a SOP for our customer onboarding process",
        answer: `## Customer Onboarding SOP

**Purpose:** Ensure every new customer reaches their first value moment within 14 days of signing up.

**Scope:** Applies to all Customer Success Managers for customers on Growth and Enterprise plans.

---

### Step 1: Welcome & Account Setup (Day 0)
- Send personalized welcome email within 2 hours of contract signing
- Provision workspace and invite the customer's primary admin
- Share onboarding checklist and schedule kick-off call (within 48h)

### Step 2: Kick-off Call (Days 1–2)
- Review customer's primary use cases and success criteria
- Identify 2–3 quick wins to demonstrate value in first week
- Assign dedicated CSM and share Slack channel invite

### Step 3: Initial Configuration (Days 2–5)
- Guide admin through workspace settings and integrations
- Set up first data source connection (Notion, Confluence, Slack, etc.)
- Create 1–2 agents tailored to the team's priority workflow

### Step 4: First Value Milestone (Days 5–10)
- Run first live session with the end-user team
- Capture feedback and address any blockers
- Document wins and share with customer stakeholders

### Step 5: Handoff & Ongoing Success (Day 14)
- Confirm all integrations are live
- Schedule monthly review cadence
- Ensure at least 5 active users in the workspace

**Success Metric:** ≥5 active users and 1 completed workflow within 14 days.`,
      },
      {
        question: "Create a SOP for employee offboarding",
        answer: `## Employee Offboarding SOP

**Purpose:** Ensure smooth transitions, protect company data, and maintain team continuity when an employee leaves.

**Scope:** All departments. Applies to voluntary and involuntary departures.

---

### Step 1: Notice Received (Day 0)
- HR notifies IT, manager, and Finance immediately
- Create offboarding ticket in project tracker
- Confirm last working day and arrange exit interview

### Step 2: Knowledge Transfer (Week 1)
- Identify all active projects and responsibilities
- Employee documents key processes, contacts, and credentials
- Schedule handoff meetings with team members taking over tasks
- Update shared team documentation and wikis

### Step 3: Access & Asset Management (Last 3 Days)
- Revoke access to all SaaS tools and internal systems on final day
- Collect company devices, badges, and equipment
- Transfer ownership of shared drives, email aliases, and accounts
- Forward email to manager for 30 days post-departure

### Step 4: Exit & Offboarding Completion (Last Day)
- Conduct exit interview (HR)
- Process final paycheck and benefits termination
- Remove from all communication channels and org chart

### Step 5: Post-Departure (Week 1 After)
- Confirm all access revoked (IT sign-off)
- Update org chart and reporting structures
- Reassign ongoing work to team members

**Owner:** HR + direct manager. **Timeline:** Complete within 5 business days of last day.`,
      },
      {
        question: "Write a SOP for handling customer escalations",
        answer: `## Customer Escalation Handling SOP

**Purpose:** Resolve high-priority customer issues quickly while protecting the relationship and capturing learnings.

**Scope:** Customer Success and Support teams. Applies to Severity 1 and Severity 2 issues.

---

### Severity Levels
- **S1 (Critical):** Product is down or unusable. Response: < 1 hour.
- **S2 (High):** Major feature broken, business impact. Response: < 4 hours.
- **S3 (Medium):** Significant inconvenience, workaround exists. Response: < 24 hours.

---

### Step 1: Acknowledge (< 1h for S1/S2)
- Reply to customer with acknowledgment and ticket reference
- Set internal escalation flag in CRM
- Notify CSM and Engineering lead for S1 issues

### Step 2: Triage & Diagnosis (< 2h)
- Reproduce the issue in staging environment
- Identify root cause (product bug, configuration, data issue)
- Assign engineering owner with SLA target

### Step 3: Active Resolution
- Provide customer with status updates every 2 hours for S1
- If fix requires > 4h: offer temporary workaround
- Document all findings in the ticket

### Step 4: Resolution & Confirmation
- Notify customer immediately upon fix deployment
- Confirm resolution with customer within 24h
- Offer concession if SLA was breached (e.g., service credit)

### Step 5: Post-Incident Review
- Complete internal postmortem for all S1 issues
- Update FAQ/documentation if needed
- Share learnings with product team

**Escalation Path:** Support Rep → CSM → CSM Lead → VP Customer Success`,
      },
    ],
  },
  {
    id: "job-description",
    title: "Job Description Generator",
    description:
      "Write compelling, inclusive job descriptions in seconds. Tailored to your role, team, and company culture.",
    icon: UserGroupIcon,
    colorClasses: {
      bg: "bg-blue-100",
      icon: "text-blue-700",
      cardHover: "hover:bg-blue-50",
      tag: "bg-blue-100 text-blue-700",
    },
    tags: ["Recruiting", "HR"],
    href: "/home/agents/job-description",
    seo: {
      title: "Job Description Generator AI Agent | Dust",
      description:
        "Write compelling, inclusive job descriptions in seconds. Tailored to your role, team, and company culture using AI.",
    },
    demoExchanges: [
      {
        question: "Write a job description for a Senior Product Manager",
        answer: `## Senior Product Manager

**About the Role**

We're looking for a Senior Product Manager to lead the development of our core platform. You'll work at the intersection of user research, engineering, and business strategy to build products that customers love.

---

**What You'll Do**

- Own the product roadmap for one or more core areas of the platform
- Conduct customer interviews, analyze usage data, and synthesize insights into actionable decisions
- Define, prioritize, and write detailed specs for new features with clear success metrics
- Partner with engineering and design to deliver high-quality features on schedule
- Work with Sales and Customer Success to ensure product-market fit and drive adoption
- Present roadmap updates to leadership and external stakeholders

**What We're Looking For**

- 5+ years of product management experience, ideally in B2B SaaS
- Strong analytical mindset — you make decisions with data, not gut instinct
- Excellent communication skills: you can write a tight spec and present to executives
- Experience shipping products used by thousands of users
- Comfortable working in a fast-paced environment with ambiguity

**Nice to Have**

- Experience with AI/ML products or developer tools
- Background in engineering or design

**What We Offer**

- Competitive salary + equity
- Remote-friendly culture with quarterly offsites
- $1,500 annual learning budget

*We are an equal opportunity employer committed to building an inclusive team.*`,
      },
      {
        question: "Create a JD for a Customer Success Manager",
        answer: `## Customer Success Manager

**About the Role**

We're hiring a Customer Success Manager to own the post-sale relationship for our mid-market and enterprise accounts. You'll be the strategic partner our customers rely on to get maximum value from the platform.

---

**What You'll Do**

- Own a portfolio of 30–50 mid-market and enterprise accounts from onboarding through renewal
- Build deep relationships with champions and executive sponsors at key accounts
- Drive product adoption by identifying underutilized features and creating tailored success plans
- Lead Quarterly Business Reviews (QBRs) to demonstrate ROI and align on next steps
- Identify expansion and upsell opportunities in collaboration with Account Executives
- Be the voice of the customer internally — relay feedback to Product and Engineering
- Monitor health scores and proactively address at-risk accounts

**What We're Looking For**

- 3+ years in Customer Success, Account Management, or a client-facing role in B2B SaaS
- Demonstrated track record of hitting retention and expansion targets
- Strong communication skills — you can run an executive-level QBR with confidence
- Highly organized with experience managing a large book of business

**Nice to Have**

- Experience with CS platforms (Gainsight, Planhat, Salesforce)
- Background in AI, data, or productivity tooling

**What We Offer**

- Competitive base salary + performance bonus
- Full benefits (health, dental, vision)
- Remote-first with regular team meetups

*We are committed to building a diverse and inclusive team.*`,
      },
      {
        question: "Draft a job posting for a Growth Marketing Manager",
        answer: `## Growth Marketing Manager

**About the Role**

We're hiring a Growth Marketing Manager to drive pipeline and user acquisition. You'll own our paid and organic growth channels, run experiments, and turn data into scalable growth loops.

This is a builder's role — you'll be hands-on with campaigns, copy, and analytics from day one.

---

**What You'll Do**

- Own demand generation: paid search, paid social, SEO, and content distribution
- Design and run A/B experiments across landing pages, ad copy, and conversion flows
- Manage and optimize paid budgets across Google, LinkedIn, and Meta
- Collaborate with the content team to develop SEO-driven articles and landing pages
- Analyze funnel metrics, identify drop-off points, and ship improvements fast
- Report weekly on CAC, MQL volume, pipeline contribution, and channel ROI
- Partner with Sales to align on ICP, messaging, and lead quality

**What We're Looking For**

- 3–5 years in growth, demand generation, or performance marketing (B2B SaaS preferred)
- Strong analytical skills — comfortable in Looker, GA4, or equivalent
- Experience managing $50K+/month in paid spend
- Proven ability to run end-to-end campaigns independently

**Nice to Have**

- Experience with marketing automation (HubSpot, Marketo)
- Background in AI, developer tools, or productivity software

**What We Offer**

- Competitive compensation + equity
- Remote-first, $2,000 annual growth & learning budget

*We're an equal opportunity employer and value diversity in all forms.*`,
      },
    ],
  },
  {
    id: "incident-postmortem",
    title: "Incident Postmortem Template",
    description:
      "Document incidents thoroughly with structured postmortems. Help your team learn faster and prevent recurrence.",
    icon: ClipboardCheckIcon,
    colorClasses: {
      bg: "bg-rose-100",
      icon: "text-rose-700",
      cardHover: "hover:bg-rose-50",
      tag: "bg-rose-100 text-rose-700",
    },
    tags: ["Engineering", "Operations"],
    href: "/home/agents/incident-postmortem",
    seo: {
      title: "Incident Postmortem AI Agent | Dust",
      description:
        "Document incidents thoroughly with AI-powered structured postmortems. Help your team learn faster and prevent recurrence.",
    },
    demoExchanges: [
      {
        question: "Write a postmortem for a 2-hour API outage",
        answer: `## Incident Postmortem: API Outage (2h)

**Date:** [Date of incident]
**Duration:** 2 hours (14:03 – 16:07 UTC)
**Severity:** SEV-1 | **Status:** Resolved

---

### Summary
A memory leak in the API gateway caused cascading failures across all API endpoints. Customers were unable to make API calls for approximately 2 hours. Root cause: a code change deployed at 13:45 UTC introduced an unbounded cache in the request handler.

### Timeline

| Time (UTC) | Event |
|------------|-------|
| 13:45 | Deploy v2.4.1 to production (includes cache refactor) |
| 14:03 | On-call alert: API error rate > 5% |
| 14:11 | Incident declared, Slack channel opened |
| 14:28 | Root cause identified: memory leak in v2.4.1 |
| 14:45 | Rollback initiated |
| 16:07 | Full recovery confirmed |

### Root Cause
The new caching layer did not implement cache eviction. Under production load, memory exhausted within ~18 minutes, triggering OOM kills on API pods.

### Impact
- **Users affected:** ~3,400 | **API calls failed:** ~87,000
- **Customer complaints:** 14 (4 enterprise accounts)

### Action Items

| Action | Owner | Due Date |
|--------|-------|----------|
| Add cache eviction policy | Backend | +3 days |
| Add memory usage alert (threshold: 80%) | Platform | +2 days |
| Improve rollback runbook | On-call | +1 week |
| Notify enterprise customers with RCA | CSM | +24h |

### Lessons Learned
The deploy pipeline lacked load testing that would have caught memory growth. We need pre-production performance testing for any change touching request handling code.`,
      },
      {
        question: "Document an incident where a deploy broke our checkout flow",
        answer: `## Incident Postmortem: Checkout Flow Failure

**Date:** [Date of incident]
**Duration:** 47 minutes (09:14 – 10:01 UTC)
**Severity:** SEV-1 | **Status:** Resolved

---

### Summary
A routine frontend deploy introduced a JavaScript runtime error that prevented users from completing checkout. Approximately 34% of checkout attempts failed during the incident window. The issue was caught via a spike in Stripe webhook failures and customer support tickets.

### Timeline

| Time (UTC) | Event |
|------------|-------|
| 09:00 | Frontend deploy v3.1.0 to production |
| 09:14 | Stripe webhook error rate spikes to 12% |
| 09:19 | Support receives 3 customer tickets |
| 09:22 | On-call engineer alerted |
| 09:31 | Root cause identified: null reference in payment component |
| 10:01 | Hotfix deployed, checkout restored |

### Root Cause
A refactor of the payment form introduced a null reference error for users with saved payment methods. The error was silently swallowed by the error boundary, displaying a blank form rather than an error state.

### Impact
- **Failed checkouts:** ~340
- **Estimated revenue impact:** ~$18,000
- **Customers notified:** 22 (via email within 4 hours)

### Action Items

| Action | Owner | Due Date |
|--------|-------|----------|
| Add E2E test for checkout with saved payment method | Frontend | +3 days |
| Set up real-time checkout conversion monitoring | Analytics | +1 week |
| Review all error boundaries to prevent silent failures | Frontend | +2 weeks |

### Lessons Learned
Missing E2E test coverage for a critical user flow allowed a regression to reach production. Going forward, checkout and billing flows require dedicated integration tests before any deploy.`,
      },
      {
        question: "Create a postmortem for a data pipeline failure",
        answer: `## Incident Postmortem: Data Pipeline Failure

**Date:** [Date of incident]
**Duration:** 6 hours 22 minutes (01:17 – 07:39 UTC)
**Severity:** SEV-2 | **Status:** Resolved

---

### Summary
A schema change in an upstream data source caused our ETL pipeline to fail silently. Dashboard metrics were stale for ~6 hours before detection. No data was lost, but customers on affected plans saw outdated analytics during the window.

### Timeline

| Time (UTC) | Event |
|------------|-------|
| 00:55 | Upstream provider deploys schema v4.2 (adds required field) |
| 01:17 | ETL pipeline begins failing silently (no alert triggered) |
| 07:12 | Engineer notices stale dashboard data during morning review |
| 07:31 | Schema mismatch identified as root cause |
| 07:39 | Schema mapping updated, pipeline begins reprocessing |
| 08:55 | Dashboards fully up to date |

### Root Cause
Our pipeline validation did not check for required fields added by upstream. When the new field was missing, records were silently dropped rather than raising an error. No alerting was in place for pipeline job failure duration.

### Impact
- **Customers affected:** 89 (Analytics plan)
- **Data delay:** 6h 22min
- **Data loss:** None (all records reprocessed successfully)

### Action Items

| Action | Owner | Due Date |
|--------|-------|----------|
| Add schema validation against upstream contract | Data Eng | +5 days |
| Alert: pipeline not completed within 30min of schedule | Platform | +3 days |
| Establish upstream schema change notification process | Partnerships | +2 weeks |
| Document runbook for schema mismatch recovery | Data Eng | +1 week |

### Lessons Learned
Upstream schema changes should be communicated in advance. We need a formal integration contract and versioning strategy with key data providers to prevent silent failures.`,
      },
    ],
  },
  {
    id: "prompt-maker",
    title: "Prompt Maker",
    description:
      "Transform vague ideas into precise, effective AI prompts. Get better results from any AI tool, every time.",
    icon: MagicIcon,
    colorClasses: {
      bg: "bg-green-100",
      icon: "text-green-700",
      cardHover: "hover:bg-green-50",
      tag: "bg-green-100 text-green-700",
    },
    tags: ["AI", "Productivity"],
    href: "/home/agents/prompt-maker",
    seo: {
      title: "Prompt Maker AI Agent | Dust",
      description:
        "Transform vague ideas into precise, effective AI prompts. Get better results from any AI tool, every time.",
    },
    demoExchanges: [
      {
        question: "Turn this into a great prompt: summarize customer feedback",
        answer: `## Your Improved Prompt

Here's your original idea transformed into a precise, effective prompt:

---

**Original:** "summarize customer feedback"

**Improved Prompt:**

> You are a customer insights analyst. I will provide you with a collection of customer feedback messages (from support tickets, NPS surveys, reviews, or interviews). Your task is to:
>
> 1. **Identify the top 5 recurring themes** — group feedback into clusters with a clear label for each
> 2. **Highlight the most critical pain points** — flag issues that appear most frequently or carry the highest emotional intensity
> 3. **Capture positive signals** — note what customers love or consistently praise
> 4. **Surface any product requests** — list specific feature asks or improvements mentioned
> 5. **Provide an executive summary** (3–4 sentences) suitable for sharing with leadership
>
> Format your output with clear headings. Use bullet points for themes. Keep language concise and direct.
>
> Here is the feedback to analyze:
> [PASTE FEEDBACK HERE]

---

**Why this is better:**
- **Role assignment** makes the AI adopt an expert frame
- **Numbered tasks** prevent vague output — the AI knows exactly what to produce
- **Output format specified** eliminates guesswork
- **Clear placeholder** tells you exactly where to insert your data`,
      },
      {
        question: "Improve my prompt for writing cold emails",
        answer: `## Your Improved Prompt

Here's your cold email prompt, upgraded for precision and results:

---

**Original:** "write cold emails"

**Improved Prompt:**

> You are an expert B2B sales copywriter specializing in cold outreach. Write a cold email for the following context:
>
> **Target persona:** [Job title, industry, company size]
> **Our product/service:** [What you sell in one sentence]
> **Primary pain point we solve:** [Specific problem]
> **Desired action:** [What you want them to do — reply, book a call, etc.]
> **Tone:** Professional but conversational — not salesy
>
> Email requirements:
> - Subject line: max 7 words, create curiosity without clickbait
> - Opening: Lead with their problem or a relevant observation (no "I hope this email finds you well")
> - Body: 2–3 short sentences connecting their pain to our solution
> - CTA: One clear, low-friction ask (e.g., "Worth a 20-minute call?")
> - Total length: Under 120 words
>
> Write 3 variations with different opening angles.

---

**Why this works:**
- Forces context before writing — no generic output
- Specifies length and format constraints
- Requests multiple variations so you can A/B test
- Rules out bad patterns explicitly`,
      },
      {
        question: "Make this prompt better: generate weekly status reports",
        answer: `## Your Improved Prompt

Here's your status report prompt, sharpened for consistent, high-quality output:

---

**Original:** "generate weekly status reports"

**Improved Prompt:**

> You are a project coordinator helping a team communicate weekly progress clearly and concisely. Generate a weekly status report based on the following inputs:
>
> **Team/Project name:** [Name]
> **Reporting period:** [Week of DATE]
> **Audience:** [Who will read this — manager, exec, stakeholders]
>
> Raw updates to synthesize:
> [PASTE BULLET POINTS OR NOTES HERE]
>
> Format the report with these sections:
>
> **✅ Completed This Week** — What was shipped, resolved, or closed (include metrics if available)
>
> **🚧 In Progress** — What's actively being worked on (include % complete or ETA if known)
>
> **⚠️ Blockers & Risks** — Issues slowing progress and what's needed to unblock
>
> **📋 Next Week Priorities** — Top 3–5 priorities for the coming week
>
> Keep the tone direct and factual. No filler. Total length: 200–300 words.

---

**Why this is better:**
- Structured sections ensure nothing gets missed
- Emoji headers make it scannable at a glance
- Length constraint enforces brevity
- "Audience" field adapts the tone appropriately`,
      },
    ],
  },
];

export const AGENTS_PAGE_CONFIG = {
  hero: {
    uptitle: "AI Agents",
    title: <>Ready-to-use AI agents for your team</>,
    description: (
      <>
        Pre-built AI agents that save your team hours every week. Pick one,
        customize it to your workflow, and start working smarter in minutes.
      </>
    ),
  },
  gallery: {
    sectionTitle: "Meet your new AI teammates",
    sectionDescription:
      "Each agent is ready to use out of the box. No setup required.",
  },
  benefits: [
    {
      title: "Zero setup",
      description:
        "Every agent is pre-configured and ready to use the moment you open it.",
    },
    {
      title: "Fully customizable",
      description:
        "Adapt any agent's instructions, tone, and behavior to match your exact workflow.",
    },
    {
      title: "Enterprise-ready",
      description:
        "Built on Dust's secure, SOC 2 Type II certified infrastructure. Your data stays your data.",
    },
  ],
  seo: {
    title: "Ready-to-use AI Agents for Teams | Dust",
    description:
      "Browse Dust's library of pre-built AI agents. Generate SOPs, job descriptions, incident postmortems, and more. No setup required.",
  },
};
