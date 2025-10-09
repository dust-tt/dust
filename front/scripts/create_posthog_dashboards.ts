/**
 * Create PostHog dashboards for Dust user journey tracking.
 *
 * Usage:
 *   POSTHOG_API_KEY=xxx POSTHOG_PROJECT_ID=123 tsx front/scripts/create_posthog_dashboards.ts --execute
 */

import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type InsightEvent = {
  kind: string;
  event: string;
  name: string;
  math?: string;
  properties?: unknown[];
};

type Dashboard = {
  id: number;
  name: string;
};

type Insight = {
  id: number;
  name: string;
  dashboards?: number[];
};

// PostHog Action shape (kept for future full Actions migration)
type _Action = {
  id: number;
  name: string;
};

class PostHogDashboardCreator {
  private apiKey: string;
  private projectId: string;
  private host: string;

  constructor(
    apiKey: string,
    projectId: string,
    host = "https://eu.posthog.com"
  ) {
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.host = host.replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    method: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.host}/api/projects/${this.projectId}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `PostHog API error: ${response.status} ${response.statusText}\n${text}`
      );
    }

    return response.json() as Promise<T>;
  }

  async listDashboards(): Promise<{ results: Dashboard[] }> {
    return this.request<{ results: Dashboard[] }>("/dashboards/", "GET");
  }

  async deleteDashboard(dashboardId: number): Promise<void> {
    await this.request(`/dashboards/${dashboardId}/`, "PATCH", {
      deleted: true,
    });
    console.log(`  ✗ Deleted dashboard ID: ${dashboardId}`);
  }

  async listInsights(): Promise<{ results: Insight[] }> {
    return this.request<{ results: Insight[] }>("/insights/", "GET");
  }

  async deleteInsight(insightId: number): Promise<void> {
    await this.request(`/insights/${insightId}/`, "PATCH", {
      deleted: true,
    });
  }

  async deleteAllDustDashboards(logger: Logger): Promise<void> {
    logger.info("🗑️  Deleting existing Dust dashboards and insights...");

    // Get all dashboards
    const dashboards = await this.listDashboards();
    const isEmojiStart = (name: string) => {
      if (!name || name.length === 0) {
        return false;
      }
      const cp = name.codePointAt(0) ?? 0;
      // Common emoji ranges (not exhaustive but good heuristic)
      return (
        (cp >= 0x1f300 && cp <= 0x1f5ff) || // Misc Symbols and Pictographs
        (cp >= 0x1f600 && cp <= 0x1f64f) || // Emoticons
        (cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport and Map
        (cp >= 0x1f700 && cp <= 0x1f77f) || // Alchemical Symbols
        (cp >= 0x1f780 && cp <= 0x1f7ff) || // Geometric Shapes Extended
        (cp >= 0x1f800 && cp <= 0x1f8ff) || // Supplemental Arrows-C
        (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols and Pictographs
        (cp >= 0x1fa00 && cp <= 0x1fa6f) || // Chess, Symbols
        (cp >= 0x2600 && cp <= 0x27bf) || // Misc symbols, Dingbats
        (cp >= 0x2300 && cp <= 0x23ff) // Misc technical incl. clocks
      );
    };

    const dustDashboards = dashboards.results.filter(
      (d) => isEmojiStart(d.name) || d.name.startsWith("[auto]")
    );

    if (dustDashboards.length === 0) {
      logger.info("  No existing Dust dashboards found");
      return;
    }

    logger.info(`  Found ${dustDashboards.length} Dust dashboard(s) to delete`);

    // Get all insights from these dashboards
    const insights = await this.listInsights();
    const dashboardIds = new Set(dustDashboards.map((d) => d.id));
    const dustInsights = insights.results.filter((insight) =>
      insight.dashboards?.some((dashId: number) => dashboardIds.has(dashId))
    );

    logger.info(`  Found ${dustInsights.length} insight(s) to delete`);

    // Delete insights first
    for (const insight of dustInsights) {
      await this.deleteInsight(insight.id);
    }

    // Then delete dashboards
    for (const dashboard of dustDashboards) {
      await this.deleteDashboard(dashboard.id);
    }

    logger.info("✅ Cleanup complete");
  }

  async listActions(): Promise<{ results: _Action[] }> {
    return this.request<{ results: _Action[] }>("/actions/", "GET");
  }

  async ensureAction(
    actionName: string,
    event: string,
    properties?: unknown[]
  ): Promise<number> {
    const existing = await this.listActions();
    const found = existing.results.find((a) => a.name === actionName);
    if (found) {
      return found.id;
    }

    const created = await this.request<_Action>("/actions/", "POST", {
      name: actionName,
      steps: [
        {
          event,
          properties: properties ?? [],
        },
      ],
      is_calculating: false,
    });
    return created.id;
  }

  async createDashboard(name: string, description = ""): Promise<Dashboard> {
    const dashboard = await this.request<Dashboard>("/dashboards/", "POST", {
      name,
      description,
      pinned: true,
    });
    console.log(`✅ Created dashboard: ${name} (ID: ${dashboard.id})`);
    return dashboard;
  }

  async createInsight(
    dashboardId: number,
    name: string,
    events: InsightEvent[],
    breakdown?: {
      breakdown: string;
      breakdown_type: string;
      breakdown_group_type_index?: number;
    },
    description?: string
  ): Promise<Insight> {
    const series: Record<string, unknown>[] = [];
    for (const ev of events) {
      // Create or find an action encapsulating this event+properties
      const actionId = await this.ensureAction(
        `[auto] ${name} – ${ev.name}`,
        ev.event,
        ev.properties
      );
      const s: Record<string, unknown> = {
        kind: "ActionsNode",
        id: actionId,
        name: ev.name,
      };
      if (ev.math) {
        s.math = ev.math;
      }
      series.push(s);
    }

    const trendsQuery: Record<string, unknown> = {
      kind: "TrendsQuery",
      series,
      dateRange: {
        date_from: "-30d",
      },
      interval: "day",
      trendsFilter: {},
    };

    if (breakdown) {
      trendsQuery.breakdownFilter = breakdown;
    }

    const insight = await this.request<Insight>("/insights/", "POST", {
      name,
      description: description ?? "",
      query: {
        kind: "InsightVizNode",
        source: trendsQuery,
      },
      dashboards: [dashboardId],
    });

    console.log(`  ✓ Added insight: ${name}`);
    return insight;
  }

  async createFunnelInsight(
    dashboardId: number,
    name: string,
    steps: InsightEvent[],
    breakdown?: {
      breakdown: string;
      breakdown_type: string;
      breakdown_group_type_index?: number;
    },
    description?: string
  ): Promise<Insight> {
    const series: Record<string, unknown>[] = [];
    for (const step of steps) {
      const actionId = await this.ensureAction(
        `[auto] ${name} – ${step.name}`,
        step.event,
        step.properties
      );
      const s: Record<string, unknown> = {
        kind: "ActionsNode",
        id: actionId,
        name: step.name,
      };
      if (step.math) {
        s.math = step.math;
      }
      series.push(s);
    }

    const funnelsQuery: Record<string, unknown> = {
      kind: "FunnelsQuery",
      series,
      dateRange: {
        date_from: "-30d",
      },
      interval: "day",
      funnelsFilter: {
        funnelWindowInterval: 30,
        funnelWindowIntervalUnit: "day",
      },
    };

    if (breakdown) {
      funnelsQuery.breakdownFilter = breakdown;
    }

    const insight = await this.request<Insight>("/insights/", "POST", {
      name,
      description: description ?? "",
      query: {
        kind: "InsightVizNode",
        source: funnelsQuery,
      },
      dashboards: [dashboardId],
    });

    console.log(`  ✓ Added funnel: ${name}`);
    return insight;
  }

  async createExecutiveOverview(logger: Logger): Promise<number> {
    logger.info("Creating Executive Overview Dashboard...");

    const dashboard = await this.createDashboard(
      "📊 Executive Overview",
      "High-level metrics for tracking overall product performance and user growth"
    );

    // Key metrics in one view
    await this.createInsight(
      dashboard.id,
      "Daily Active Users",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Active Users",
          math: "dau",
        },
      ],
      undefined,
      "Number of unique users sending messages each day"
    );

    await this.createInsight(
      dashboard.id,
      "Onboarding Pageviews (Welcome)",
      [
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Welcome Pageviews",
          math: "total",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
      ],
      undefined,
      "Pageviews of the onboarding welcome page"
    );

    await this.createInsight(
      dashboard.id,
      "Activated Users (Attachments + Tools)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "With Attachments",
          math: "dau",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "With Tools",
          math: "dau",
          properties: [
            {
              key: "has_tools",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ],
      undefined,
      "Users who sent messages with attachments or MCP tools (activation signals)"
    );

    await this.createInsight(
      dashboard.id,
      "Active Users by Customer Tier",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Active Users",
          math: "dau",
        },
      ],
      {
        breakdown: "plan_name",
        breakdown_type: "group",
        breakdown_group_type_index: 0,
      },
      "Daily active users broken down by workspace plan (Pro vs Enterprise)"
    );

    await this.createFunnelInsight(
      dashboard.id,
      "Onboarding to Activation Funnel",
      [
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Started Onboarding",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Completed Onboarding",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Created Agent",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Sent Message",
        },
      ],
      undefined,
      "Overall conversion funnel from signup to first message"
    );

    // Conversion KPIs: stage-wise unique users
    await this.createInsight(dashboard.id, "Onboarding Completed (DAU)", [
      {
        kind: "EventsNode",
        event: "auth:onboarding_complete:click",
        name: "Onboarding Completed",
        math: "dau",
      },
    ]);

    await this.createInsight(dashboard.id, "Subscription Started (DAU)", [
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Subscription Started",
        math: "dau",
      },
    ]);

    await this.createInsight(dashboard.id, "Payment Success (DAU)", [
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "Payment Success",
        math: "dau",
        properties: [
          {
            key: "$pathname",
            value: "/subscription/payment_processing",
            operator: "icontains",
            type: "event",
          },
        ],
      },
    ]);

    await this.createInsight(dashboard.id, "Agents Created (DAU)", [
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "Agents Created",
        math: "dau",
      },
    ]);

    await this.createInsight(dashboard.id, "First Messages (DAU)", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "First Messages",
        math: "dau",
      },
    ]);

    await this.createInsight(
      dashboard.id,
      "Activated (Attachments OR Tools) (DAU)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated – Attachments",
          math: "dau",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated – Tools",
          math: "dau",
          properties: [
            {
              key: "has_tools",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // Rates (paired trends)
    await this.createInsight(
      dashboard.id,
      "Onboarding Completion Rate (proxy)",
      [
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Onboarding Complete",
          math: "dau",
        },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Welcome Pageviews",
          math: "dau",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
      ]
    );

    await this.createInsight(dashboard.id, "Trial Conversion (proxy)", [
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "Payment Success",
        math: "dau",
        properties: [
          {
            key: "$pathname",
            value: "/subscription/payment_processing",
            operator: "icontains",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Trial Starts",
        math: "dau",
        properties: [
          {
            key: "is_trial",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    await this.createInsight(dashboard.id, "Agent Creation Rate (proxy)", [
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "Agents Created",
        math: "dau",
      },
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Subscribed",
        math: "dau",
      },
    ]);

    await this.createInsight(dashboard.id, "Activation Rate (proxy)", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "Activated – Attachments",
        math: "dau",
        properties: [
          {
            key: "has_attachments",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "Activated – Tools",
        math: "dau",
        properties: [
          {
            key: "has_tools",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "auth:onboarding_complete:click",
        name: "Onboarding Complete",
        math: "dau",
      },
    ]);

    // Setup adoption summary
    await this.createInsight(
      dashboard.id,
      "Top Data Source Providers (30d)",
      [
        {
          kind: "EventsNode",
          event: "datasources:provider_select:click",
          name: "Provider Selections",
          math: "total",
        },
      ],
      { breakdown: "provider", breakdown_type: "event" }
    );

    await this.createInsight(
      dashboard.id,
      "Tools Adoption (Messages with Tools)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Messages with Tools",
          math: "total",
          properties: [
            {
              key: "has_tools",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createConversionOverview(logger: Logger): Promise<number> {
    logger.info("Creating Conversion Overview Dashboard...");

    const dashboard = await this.createDashboard(
      "🎯 Conversion Overview",
      "Detailed breakdown of user journey steps from onboarding to activation"
    );

    // 1. Onboarding starts
    await this.createInsight(dashboard.id, "1️⃣ Onboarding Starts", [
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "onboarding_welcome_pageview",
        math: "dau",
        properties: [
          {
            key: "$pathname",
            value: "/welcome",
            operator: "icontains",
            type: "event",
          },
        ],
      },
    ]);

    // 2. Onboarding completions
    await this.createInsight(dashboard.id, "2️⃣ Onboarding Completions", [
      {
        kind: "EventsNode",
        event: "auth:onboarding_complete:click",
        name: "auth:onboarding_complete:click",
        math: "dau",
      },
    ]);

    // 3. Paywall passed
    await this.createInsight(dashboard.id, "3️⃣ Paywall Passed", [
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "auth:subscription_start:click",
        math: "dau",
      },
    ]);

    // 4. Subscribers (payment succeeded)
    await this.createInsight(dashboard.id, "4️⃣ Subscribers (Payment Success)", [
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "$pageview",
        math: "dau",
        properties: [
          {
            key: "$pathname",
            value: "/subscription/payment_processing",
            operator: "icontains",
            type: "event",
          },
        ],
      },
    ]);

    // 5. Agents created
    await this.createInsight(dashboard.id, "5️⃣ Agents Created", [
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "builder:create_agent:submit",
        math: "dau",
      },
    ]);

    // 6. First messages
    await this.createInsight(dashboard.id, "6️⃣ First Messages Sent", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "conversation:message_send:submit",
        math: "dau",
      },
    ]);

    // 7. Activated users - with attachments
    await this.createInsight(
      dashboard.id,
      "7️⃣ ⭐ Activated Users (Attachments)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "With Attachments",
          math: "dau",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // 8. Activated users - with MCP
    await this.createInsight(dashboard.id, "8️⃣ ⭐ Activated Users (Tools)", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "With Tools",
        math: "dau",
        properties: [
          {
            key: "has_tools",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createDropoffAnalysis(logger: Logger): Promise<number> {
    logger.info("Creating Drop-off Analysis Dashboard...");

    const dashboard = await this.createDashboard(
      "📉 Drop-off Analysis",
      "Funnel analysis showing where users drop off in the journey"
    );

    // Complete funnel
    await this.createFunnelInsight(
      dashboard.id,
      "🔍 Complete Activation Funnel",
      [
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Onboarding Start",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Onboarding Complete",
        },
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Paywall Passed",
        },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Payment Success",
          properties: [
            {
              key: "$pathname",
              value: "/subscription/payment_processing",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agent Created",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "First Message",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "⭐ Activated (Attachments)",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // Funnel by plan
    await this.createFunnelInsight(
      dashboard.id,
      "📊 Funnel by Plan Type",
      [
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Onboarding Start",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Onboarding Complete",
        },
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Paywall Passed",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agent Created",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated (Attachments)",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    // Early drop-off
    await this.createFunnelInsight(dashboard.id, "🚪 Early Drop-off: Paywall", [
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "Onboarding Start",
        properties: [
          {
            key: "$pathname",
            value: "/welcome",
            operator: "icontains",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Paywall Passed",
      },
    ]);

    // Mid drop-off
    await this.createFunnelInsight(
      dashboard.id,
      "🔨 Mid Drop-off: Agent Creation",
      [
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Subscribed",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agent Created",
        },
      ]
    );

    // Late drop-off
    await this.createFunnelInsight(
      dashboard.id,
      "💬 Late Drop-off: Activation",
      [
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agent Created",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Message Sent",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "⭐ Activated (Attachments)",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createTimeToValue(logger: Logger): Promise<number> {
    logger.info("Creating Time to Value Dashboard...");

    const dashboard = await this.createDashboard(
      "⏱️ Time to Value",
      "How quickly users reach activation and key milestones"
    );

    // Activation rate by plan
    await this.createInsight(
      dashboard.id,
      "📈 Activation Rate by Plan (Attachments)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated Users",
          math: "dau",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    // Data source popularity
    await this.createInsight(
      dashboard.id,
      "📊 Most Popular Data Sources",
      [
        {
          kind: "EventsNode",
          event: "datasources:provider_select:click",
          name: "Data Source Connections",
          math: "total",
        },
      ],
      { breakdown: "provider", breakdown_type: "event" }
    );

    logger.info(
      "\n⚠️  Note: Time-to-event insights need to be created manually in PostHog UI"
    );
    logger.info(
      "   Go to the dashboard and add these insights with 'Time to event' query type:"
    );
    logger.info(
      "   1. Time from 'onboarding_start_view' to 'activation' (median + percentiles)"
    );
    logger.info("   2. Breakdown by plan_name");
    logger.info("   3. Show P25, P50 (median), P75 percentiles");

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createMarketingPerformance(logger: Logger): Promise<number> {
    logger.info("Creating Marketing Performance Dashboard...");

    const dashboard = await this.createDashboard(
      "🎯 Marketing Performance",
      "Track landing page performance: Homepage, Solutions, Industry pages"
    );

    // Homepage CTAs
    await this.createInsight(dashboard.id, "🏠 Homepage CTA Clicks", [
      {
        kind: "EventsNode",
        event: "home:hero_get_started:click",
        name: "Get Started",
      },
      {
        kind: "EventsNode",
        event: "home:hero_book_demo:click",
        name: "Book Demo",
      },
      {
        kind: "EventsNode",
        event: "home:cta_try_dust:click",
        name: "Try Dust",
      },
      {
        kind: "EventsNode",
        event: "home:cta_request_demo:click",
        name: "Request Demo",
      },
    ]);

    // Pricing page CTAs
    await this.createInsight(dashboard.id, "💰 Pricing Page Actions", [
      {
        kind: "EventsNode",
        event: "pricing:hero_start_trial:click",
        name: "Start Trial",
      },
      {
        kind: "EventsNode",
        event: "pricing:plan_pro_select:click",
        name: "Select Pro",
      },
      {
        kind: "EventsNode",
        event: "pricing:plan_enterprise_contact:click",
        name: "Contact Enterprise",
      },
    ]);

    // Solutions pages - aggregated
    await this.createInsight(dashboard.id, "🎯 Solutions Pages - All CTAs", [
      {
        kind: "EventsNode",
        event: "solutions:sales_hero_cta_primary:click",
        name: "Sales",
      },
      {
        kind: "EventsNode",
        event: "solutions:support_hero_cta_primary:click",
        name: "Support",
      },
      {
        kind: "EventsNode",
        event: "solutions:marketing_hero_cta_primary:click",
        name: "Marketing",
      },
      {
        kind: "EventsNode",
        event: "solutions:data_hero_cta_primary:click",
        name: "Data",
      },
      {
        kind: "EventsNode",
        event: "solutions:engineering_hero_cta_primary:click",
        name: "Engineering",
      },
      {
        kind: "EventsNode",
        event: "solutions:productivity_hero_cta_primary:click",
        name: "Productivity",
      },
      {
        kind: "EventsNode",
        event: "solutions:knowledge_hero_cta_primary:click",
        name: "Knowledge",
      },
      {
        kind: "EventsNode",
        event: "solutions:it_hero_cta_primary:click",
        name: "IT",
      },
      {
        kind: "EventsNode",
        event: "solutions:legal_hero_cta_primary:click",
        name: "Legal",
      },
      {
        kind: "EventsNode",
        event: "solutions:people_hero_cta_primary:click",
        name: "People",
      },
    ]);

    // Industry pages - aggregated
    await this.createInsight(dashboard.id, "🏭 Industry Pages - All CTAs", [
      {
        kind: "EventsNode",
        event: "industry:b2b_hero_cta_primary:click",
        name: "B2B SaaS",
      },
      {
        kind: "EventsNode",
        event: "industry:financial_hero_cta_primary:click",
        name: "Financial",
      },
      {
        kind: "EventsNode",
        event: "industry:insurance_hero_cta_primary:click",
        name: "Insurance",
      },
      {
        kind: "EventsNode",
        event: "industry:marketplace_hero_cta_primary:click",
        name: "Marketplace",
      },
      {
        kind: "EventsNode",
        event: "industry:retail_hero_cta_primary:click",
        name: "Retail",
      },
      {
        kind: "EventsNode",
        event: "industry:consulting_hero_cta_primary:click",
        name: "Consulting",
      },
      {
        kind: "EventsNode",
        event: "industry:media_hero_cta_primary:click",
        name: "Media",
      },
      {
        kind: "EventsNode",
        event: "industry:energy_hero_cta_primary:click",
        name: "Energy",
      },
      {
        kind: "EventsNode",
        event: "industry:investment_hero_cta_primary:click",
        name: "Investment",
      },
      {
        kind: "EventsNode",
        event: "industry:manufacturing_hero_cta_primary:click",
        name: "Manufacturing",
      },
    ]);

    // Marketing to signup funnel
    await this.createFunnelInsight(
      dashboard.id,
      "🚀 Marketing Page → Signup Funnel",
      [
        {
          kind: "EventsNode",
          event: "home:hero_get_started:click",
          name: "Landing Page CTA",
        },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Onboarding Started",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Onboarding Complete",
        },
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Subscription Started",
        },
      ]
    );

    // Discovery CTA → Activation funnel (marketing → signup → activation)
    await this.createFunnelInsight(
      dashboard.id,
      "🎯 Discovery CTA → Activation",
      [
        {
          kind: "EventsNode",
          event: "home:hero_get_started:click",
          name: "Landing CTA",
        },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Welcome pageview",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "auth:onboarding_complete:click",
          name: "Onboarding complete",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agent created",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated (attachments)",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // Contact form insights & conversion
    await this.createInsight(dashboard.id, "📨 Contact Form Lifecycle", [
      {
        kind: "EventsNode",
        event: "contact:hubspot_form:ready",
        name: "Ready",
      },
      {
        kind: "EventsNode",
        event: "contact:hubspot_form:next_step",
        name: "Next",
      },
      {
        kind: "EventsNode",
        event: "contact:hubspot_form:previous_step",
        name: "Back",
      },
      {
        kind: "EventsNode",
        event: "contact:hubspot_form:submit",
        name: "Submit",
      },
      {
        kind: "EventsNode",
        event: "contact:hubspot_form:script_load_error",
        name: "Script Error",
      },
    ]);

    await this.createFunnelInsight(
      dashboard.id,
      "🌐 Website visited → HubSpot Contact Form submitted",
      [
        { kind: "EventsNode", event: "$pageview", name: "First page view" },
        {
          kind: "EventsNode",
          event: "contact:hubspot_form:ready",
          name: "Form ready",
        },
        {
          kind: "EventsNode",
          event: "contact:hubspot_form:submit",
          name: "Form submitted",
        },
      ]
    );

    // Website visited → Signup started
    await this.createFunnelInsight(
      dashboard.id,
      "🌐 Website visited → Signup started",
      [
        { kind: "EventsNode", event: "$pageview", name: "First page view" },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Welcome pageview",
          properties: [
            {
              key: "$pathname",
              value: "/welcome",
              operator: "icontains",
              type: "event",
            },
          ],
        },
      ]
    );

    // Website visited → Pricing conversion
    await this.createFunnelInsight(
      dashboard.id,
      "🌐 Website visited → Pricing conversion",
      [
        { kind: "EventsNode", event: "$pageview", name: "First page view" },
        {
          kind: "EventsNode",
          event: "pricing:plan_pro_select:click",
          name: "Select Pro",
        },
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Subscription started",
        },
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "Payment success",
          properties: [
            {
              key: "$pathname",
              value: "/subscription/payment_processing",
              operator: "icontains",
              type: "event",
            },
          ],
        },
      ]
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createDataSourceAdoption(logger: Logger): Promise<number> {
    logger.info("Creating Data Source Adoption Dashboard...");

    const dashboard = await this.createDashboard(
      "📊 Data Source Adoption",
      "Track which data sources users connect and adoption patterns"
    );

    // Connection menu opens
    await this.createInsight(dashboard.id, "🔌 Connection Menu Opens", [
      {
        kind: "EventsNode",
        event: "datasources:add_connection_menu:click",
        name: "Menu Opens",
        math: "total",
      },
    ]);

    // Provider selection breakdown
    await this.createInsight(
      dashboard.id,
      "🏆 Most Popular Providers",
      [
        {
          kind: "EventsNode",
          event: "datasources:provider_select:click",
          name: "Provider Selections",
          math: "total",
        },
      ],
      { breakdown: "provider", breakdown_type: "event" }
    );

    // Data source connection funnel
    await this.createFunnelInsight(
      dashboard.id,
      "📈 Data Source Connection Funnel",
      [
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Subscribed",
        },
        {
          kind: "EventsNode",
          event: "datasources:add_connection_menu:click",
          name: "Opened Connection Menu",
        },
        {
          kind: "EventsNode",
          event: "datasources:provider_select:click",
          name: "Selected Provider",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Created Agent",
        },
      ]
    );

    // Tools adoption funnel (menu → select tool → message with tools)
    await this.createFunnelInsight(dashboard.id, "⚙️ Tools adoption funnel", [
      {
        kind: "EventsNode",
        event: "tools:add_tools_menu:click",
        name: "Open add tools",
      },
      {
        kind: "EventsNode",
        event: "tools:tool_select:click",
        name: "Select tool",
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "Message with tools",
        properties: [
          {
            key: "has_tools",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    // Provider selection by plan
    await this.createInsight(
      dashboard.id,
      "📊 Provider Selection by Plan",
      [
        {
          kind: "EventsNode",
          event: "datasources:provider_select:click",
          name: "Provider Selections",
          math: "total",
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createBuilderEngagement(logger: Logger): Promise<number> {
    logger.info("Creating Builder Engagement Dashboard...");

    const dashboard = await this.createDashboard(
      "🔨 Builder Engagement",
      "Track assistant creation patterns and builder usage"
    );

    // Create menu interactions
    await this.createInsight(dashboard.id, "➕ Builder Actions", [
      {
        kind: "EventsNode",
        event: "builder:create_menu:click",
        name: "Opened Create Menu",
      },
      {
        kind: "EventsNode",
        event: "builder:create_from_scratch:click",
        name: "From Scratch",
      },
      {
        kind: "EventsNode",
        event: "builder:create_from_template:click",
        name: "From Template",
      },
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "Agent Created",
      },
    ]);

    // Agent creation by scope
    await this.createInsight(
      dashboard.id,
      "🌐 Agent Scope Distribution",
      [
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agents Created",
          math: "total",
        },
      ],
      { breakdown: "scope", breakdown_type: "event" }
    );

    // Agents with actions
    await this.createInsight(dashboard.id, "⚡ Agents with MCP Actions", [
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "With Actions",
        math: "total",
        properties: [
          {
            key: "has_actions",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "builder:create_agent:submit",
        name: "Without Actions",
        math: "total",
        properties: [
          {
            key: "has_actions",
            value: ["false"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    // Builder funnel
    await this.createFunnelInsight(
      dashboard.id,
      "🎯 Builder Completion Funnel",
      [
        {
          kind: "EventsNode",
          event: "builder:create_menu:click",
          name: "Opened Menu",
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Created Agent",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "First Message",
        },
      ]
    );

    // Agent creation by plan
    await this.createInsight(
      dashboard.id,
      "📊 Agent Creation by Plan",
      [
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Agents Created",
          math: "total",
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createConversationEngagement(logger: Logger): Promise<number> {
    logger.info("Creating Conversation Engagement Dashboard...");

    const dashboard = await this.createDashboard(
      "💬 Conversation Engagement",
      "Track conversation patterns and activation signals"
    );

    // All messages vs activated messages
    await this.createInsight(dashboard.id, "📨 Message Types", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "All Messages",
        math: "total",
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "⭐ With Attachments",
        math: "total",
        properties: [
          {
            key: "has_attachments",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "⭐ With Tools",
        math: "total",
        properties: [
          {
            key: "has_tools",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    // Message features breakdown
    await this.createInsight(dashboard.id, "🎯 Message Features Used", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "With Attachments",
        math: "total",
        properties: [
          {
            key: "has_attachments",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "With Tools",
        math: "total",
        properties: [
          {
            key: "has_tools",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "With Agents",
        math: "total",
        properties: [
          {
            key: "has_agents",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    // New conversations
    await this.createInsight(dashboard.id, "🆕 New Conversations Started", [
      {
        kind: "EventsNode",
        event: "conversation:message_send:submit",
        name: "New Conversations",
        math: "total",
        properties: [
          {
            key: "is_new_conversation",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
    ]);

    // Activation rate by plan (attachments)
    await this.createInsight(
      dashboard.id,
      "⭐ Activation by Plan (Attachments)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Messages with Attachments",
          math: "dau",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    // Activation rate by plan (MCP)
    await this.createInsight(
      dashboard.id,
      "⭐ Activation by Plan (Tools)",
      [
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Messages with Tools",
          math: "dau",
          properties: [
            {
              key: "has_tools",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ],
      { breakdown: "plan_name", breakdown_type: "person" }
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }

  async createTrialAnalysis(logger: Logger): Promise<number> {
    logger.info("Creating Trial Analysis Dashboard...");

    const dashboard = await this.createDashboard(
      "🎯 Trial Analysis",
      "Track trial user behavior and conversion patterns"
    );

    // Trial starts
    await this.createInsight(dashboard.id, "🚀 Trial Events", [
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Trial Started",
        math: "total",
        properties: [
          {
            key: "is_trial",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "auth:subscription_skip_trial:click",
        name: "Trial Skipped (Paid Now)",
        math: "total",
      },
      {
        kind: "EventsNode",
        event: "auth:subscription_cancel_trial:click",
        name: "Trial Cancelled",
        math: "total",
      },
    ]);

    // Trial to paid funnel
    await this.createFunnelInsight(dashboard.id, "💳 Trial → Paid Conversion", [
      {
        kind: "EventsNode",
        event: "auth:subscription_start:click",
        name: "Trial Started",
        properties: [
          {
            key: "is_trial",
            value: ["true"],
            operator: "exact",
            type: "event",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "$pageview",
        name: "Payment Success",
        properties: [
          {
            key: "$pathname",
            value: "/subscription/payment_processing",
            operator: "icontains",
            type: "event",
          },
        ],
      },
    ]);

    // Trial activation funnel (Attachments)
    await this.createFunnelInsight(
      dashboard.id,
      "⭐ Trial → Activation (Attachments)",
      [
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Trial Started",
          properties: [
            {
              key: "is_trial",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Created Agent",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated (Attachments)",
          properties: [
            {
              key: "has_attachments",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // Trial activation funnel (MCP)
    await this.createFunnelInsight(
      dashboard.id,
      "⭐ Trial → Activation (Tools)",
      [
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Trial Started",
          properties: [
            {
              key: "is_trial",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
        {
          kind: "EventsNode",
          event: "builder:create_agent:submit",
          name: "Created Agent",
        },
        {
          kind: "EventsNode",
          event: "conversation:message_send:submit",
          name: "Activated (Tools)",
          properties: [
            {
              key: "has_tools",
              value: ["true"],
              operator: "exact",
              type: "event",
            },
          ],
        },
      ]
    );

    // Billing period preference
    await this.createInsight(
      dashboard.id,
      "📅 Billing Period Preference",
      [
        {
          kind: "EventsNode",
          event: "auth:subscription_start:click",
          name: "Subscriptions",
          math: "total",
        },
      ],
      { breakdown: "billing_period", breakdown_type: "event" }
    );

    logger.info(
      `Dashboard URL: ${this.host}/project/${this.projectId}/dashboard/${dashboard.id}`
    );
    return dashboard.id;
  }
}

makeScript(
  {
    apiKey: {
      type: "string",
      demandOption: false,
      description:
        "PostHog API key (or set POSTHOG_API_KEY env var). Get from: PostHog > Settings > Personal API Keys",
    },
    projectId: {
      type: "string",
      demandOption: false,
      description:
        "PostHog project ID (or set POSTHOG_PROJECT_ID env var). Find in PostHog URL: /project/{ID}/...",
    },
    host: {
      type: "string",
      demandOption: false,
      description: 'PostHog host (default: "https://eu.posthog.com")',
      default: "https://eu.posthog.com",
    },
  },
  async (args, logger) => {
    // Get credentials from args or environment
    const apiKey = args.apiKey ?? process.env.POSTHOG_API_KEY;
    const projectId = args.projectId ?? process.env.POSTHOG_PROJECT_ID;
    const host =
      args.host ?? process.env.POSTHOG_HOST ?? "https://eu.posthog.com";

    logger.info(apiKey, projectId, host);

    if (!apiKey) {
      logger.error("❌ Error: POSTHOG_API_KEY not provided");
      logger.info(
        "\nGet your API key from: PostHog > Settings > Personal API Keys"
      );
      logger.info("Then run: export POSTHOG_API_KEY='phx_your_key_here'");
      logger.info("Or use: --apiKey phx_your_key_here");
      process.exit(1);
    }

    if (!projectId) {
      logger.error("❌ Error: POSTHOG_PROJECT_ID not provided");
      logger.info("\nFind your project ID in PostHog URL: /project/{ID}/...");
      logger.info("Then run: export POSTHOG_PROJECT_ID='12345'");
      logger.info("Or use: --projectId 12345");
      process.exit(1);
    }

    if (!args.execute) {
      logger.warn("🔍 Dry run mode - no dashboards will be created");
      logger.info(
        `Will create 9 comprehensive dashboards in PostHog project ${projectId}`
      );
      logger.info(
        "Dashboards: Executive Overview, Conversion Overview, Drop-off Analysis,"
      );
      logger.info(
        "            Time to Value, Marketing Performance, Data Source Adoption,"
      );
      logger.info(
        "            Builder Engagement, Conversation Engagement, Trial Analysis"
      );
      logger.info("\nUse --execute to create the dashboards");
      logger.info(
        "Note: Existing Dust dashboards will be automatically cleaned up before creating new ones"
      );
      return;
    }

    logger.info("🚀 Dust PostHog Dashboard Creator");
    logger.info("=".repeat(50));
    logger.info(`Host: ${host}`);
    logger.info(`Project ID: ${projectId}`);
    logger.info("=".repeat(50));

    try {
      const creator = new PostHogDashboardCreator(apiKey, projectId, host);

      // Clean up existing dashboards and insights
      await creator.deleteAllDustDashboards(logger);
      logger.info("");

      const dashboardIds: number[] = [];

      // Executive homepage dashboard
      dashboardIds.push(await creator.createExecutiveOverview(logger));

      // Core conversion & activation dashboards
      dashboardIds.push(await creator.createConversionOverview(logger));
      dashboardIds.push(await creator.createDropoffAnalysis(logger));
      dashboardIds.push(await creator.createTimeToValue(logger));

      // Marketing & landing pages
      dashboardIds.push(await creator.createMarketingPerformance(logger));

      // Product usage dashboards
      dashboardIds.push(await creator.createDataSourceAdoption(logger));
      dashboardIds.push(await creator.createBuilderEngagement(logger));
      dashboardIds.push(await creator.createConversationEngagement(logger));

      // Business metrics
      dashboardIds.push(await creator.createTrialAnalysis(logger));

      logger.info("\n" + "=".repeat(50));
      logger.info("✅ All 9 dashboards created successfully!");
      logger.info("=".repeat(50));
      logger.info("\n📊 Dashboards created:");
      logger.info("   1. 📊 Executive Overview - High-level KPIs (Homepage)");
      logger.info("   2. 🎯 Conversion Overview - Complete user journey");
      logger.info("   3. 📉 Drop-off Analysis - Funnel analysis");
      logger.info("   4. ⏱️  Time to Value - Speed to activation");
      logger.info("   5. 🎯 Marketing Performance - Landing pages");
      logger.info("   6. 📊 Data Source Adoption - Provider connections");
      logger.info("   7. 🔨 Builder Engagement - Agent creation");
      logger.info("   8. 💬 Conversation Engagement - Message patterns");
      logger.info("   9. 🎯 Trial Analysis - Trial conversion");

      logger.info("\n🔗 Dashboard URLs:");
      for (const dashId of dashboardIds) {
        logger.info(`   ${host}/project/${projectId}/dashboard/${dashId}`);
      }

      logger.info("\n💡 Next steps:");
      logger.info("   1. Review the dashboards in PostHog");
      logger.info(
        "   2. Manually add Time-to-Event insights to 'Time to Value' dashboard"
      );
      logger.info("   3. Customize date ranges and filters as needed");
      logger.info("   4. Create cohorts for activated users");
      logger.info("   5. Set up alerts for key metrics");
    } catch (error) {
      logger.error("❌ Error creating dashboards:");
      logger.error(error);
      if (error instanceof Error) {
        logger.error("Message:", error.message);
        logger.error("Stack:", error.stack);
      }
      process.exit(1);
    }
  }
);
