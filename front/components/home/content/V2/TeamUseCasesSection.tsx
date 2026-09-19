import { H2 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";
import { useState } from "react";

interface UseCase {
  title: string;
  description: string;
}

interface Tab {
  id: string;
  label: string;
  useCases: UseCase[];
}

const TABS: Tab[] = [
  {
    id: "engineering",
    label: "Engineering",
    useCases: [
      {
        title: "Incident response",
        description:
          "Agents pull context from PagerDuty, Datadog, and Slack to auto-triage incidents, draft runbooks, and coordinate across teams.",
      },
      {
        title: "Code review & debugging",
        description:
          "Agents review PRs against your team's standards, flag security issues, and suggest fixes grounded in your codebase context.",
      },
      {
        title: "Documentation",
        description:
          "Auto-generate and update technical docs, API references, and architecture decision records from code changes.",
      },
      {
        title: "Knowledge retrieval",
        description:
          "Search across Confluence, Notion, GitHub, and Slack to find answers instantly instead of interrupting senior engineers.",
      },
    ],
  },
  {
    id: "support",
    label: "Customer Support",
    useCases: [
      {
        title: "Ticket classification & routing",
        description:
          "Automatically categorize, prioritize, and route support tickets to the right team with full context attached.",
      },
      {
        title: "Response drafting",
        description:
          "Generate accurate, on-brand responses grounded in your knowledge base. Agents learn your tone and escalation patterns.",
      },
      {
        title: "Trend analysis",
        description:
          "Identify recurring issues, extract actionable insights from ticket patterns, and flag product bugs automatically.",
      },
      {
        title: "Quality assurance",
        description:
          "Review agent-drafted responses for accuracy and compliance before they reach customers. Maintain consistency at scale.",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    useCases: [
      {
        title: "Prospect research",
        description:
          "Automatically compile company profiles, key contacts, and competitive intelligence before every meeting.",
      },
      {
        title: "RFP & proposal generation",
        description:
          "Draft responses grounded in past wins, product docs, and pricing. Cut RFP turnaround from days to hours.",
      },
      {
        title: "Deal summaries",
        description:
          "Generate pipeline reviews, QBR prep, and deal updates automatically from CRM data and call transcripts.",
      },
      {
        title: "Competitive intelligence",
        description:
          "Track competitor moves, build battlecards, and surface relevant context during live sales conversations.",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Content",
    useCases: [
      {
        title: "Brand content creation",
        description:
          "Generate on-brand copy, blog drafts, and social content grounded in your style guide and past campaigns.",
      },
      {
        title: "Localization & translation",
        description:
          "Translate and adapt content across languages while maintaining brand voice, terminology, and regional nuance.",
      },
      {
        title: "Campaign analysis",
        description:
          "Pull data from HubSpot, Google Analytics, and LinkedIn to generate performance reports and optimization recommendations.",
      },
      {
        title: "Customer feedback synthesis",
        description:
          "Extract actionable insights from reviews, NPS surveys, and support conversations to inform messaging strategy.",
      },
    ],
  },
  {
    id: "data",
    label: "Data & Analytics",
    useCases: [
      {
        title: "Data querying & exploration",
        description:
          "Ask questions in natural language and get SQL queries, visualizations, and insights from your data warehouse.",
      },
      {
        title: "Automated reporting",
        description:
          "Generate recurring reports, dashboards, and executive summaries from live data sources on schedule.",
      },
      {
        title: "Anomaly detection",
        description:
          "Monitor metrics across systems and alert teams when patterns deviate from expected behavior.",
      },
      {
        title: "Cross-system analysis",
        description:
          "Connect data from Salesforce, Stripe, Mixpanel, and more to answer questions that span multiple systems.",
      },
    ],
  },
];

export function TeamUseCasesSection() {
  const [activeTab, setActiveTab] = useState("engineering");
  const activeContent = TABS.find((t) => t.id === activeTab);

  return (
    <section className="py-16 lg:py-24">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-highlight">
        💼 How Every Team Uses Dust
      </p>
      <H2 mono className="mb-10 text-left">
        One platform, every team, compounding&nbsp;value.
      </H2>

      <div className="mb-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={classNames(
              "whitespace-nowrap px-4 py-3 text-sm transition",
              activeTab === tab.id
                ? "border-b-2 border-highlight font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeContent && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {activeContent.useCases.map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl border border-border bg-white p-6 shadow-sm"
            >
              <h4 className="mb-3 font-semibold text-foreground">{uc.title}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {uc.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
