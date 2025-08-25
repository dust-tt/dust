import React from "react";

import { H2 } from "@app/components/home/ContentComponents";

import { CardCarousel } from "./CardCarousel";
import { FunctionCard } from "./FunctionCard";

interface FunctionCardData {
  title: string;
  color: "green" | "blue" | "rose" | "golden";
  features: string[];
  visualSrc: string;
  href: string;
}

function FunctionsSection() {
  const cards: FunctionCardData[] = [
    {
      title: "Sales",
      color: "rose",
      features: [
        "Create account snapshots from past interactions and CRM data.",
        "Generate targeted outreach using call transcripts and insights.",
        "Answer prospect questions and RFPs with product and competitor insights.",
        "Analyze calls to improve pitch delivery and objection handling.",
      ],
      visualSrc: "/static/landing/functions/sales.png",
      href: "/home/solutions/sales",
    },
    {
      title: "Marketing",
      color: "golden",
      features: [
        "Write on-brand content in minutes.",
        "Create consistent launch messaging.",
        "Translate while maintaining brand voice.",
        "Extract actionable insights from feedback.",
      ],
      visualSrc: "/static/landing/functions/marketing.png",
      href: "/home/solutions/marketing",
    },
    {
      title: "Customer Support",
      color: "blue",
      features: [
        "Connect agents to knowledge base for instant responses.",
        "Identify product improvements from ticket patterns.",
        "Auto-create FAQs from resolved tickets.",
        "Auto-route tickets based on queries and expertise.",
      ],
      visualSrc: "/static/landing/functions/customersupport.png",
      href: "/home/solutions/customer-support",
    },
    {
      title: "Knowledge",
      color: "green",
      features: [
        "Access company information across data silos instantly.",
        "Extract insights from internal discussions and documents.",
        "Build and maintain searchable knowledge bases.",
        "Surface relevant context for decision-making.",
      ],
      visualSrc: "/static/landing/functions/knowledge.png",
      href: "/home/solutions/knowledge",
    },
    {
      title: "Data & Analytics",
      color: "rose",
      features: [
        "Enable non-technical teams to query company data.",
        "Automate reporting from all data types.",
        "Transform insights into visual stories.",
        "Connect multiple data sources for unified analysis.",
      ],
      visualSrc: "/static/landing/functions/data.png",
      href: "/home/solutions/data-analytics",
    },
    {
      title: "IT",
      color: "golden",
      features: [
        "Provide first-line technical support and troubleshooting.",
        "Guide users through common IT processes.",
        "Manage and track IT assets and requests.",
        "Answer questions about security protocols and tools.",
      ],
      visualSrc: "/static/landing/functions/it.png",
      href: "/home/solutions/it",
    },
    {
      title: "Engineering",
      color: "blue",
      features: [
        "Accelerate debugging using code context, docs, and issue history in your IDE.",
        "Streamline incidents with automated runbooks, communication, and documentation.",
        "Auto-review code to ensure standards and security compliance at scale.",
        "Auto-generate and update documentation from code changes.",
      ],
      visualSrc: "/static/landing/functions/engineering.png",
      href: "/home/solutions/engineering",
    },
    {
      title: "Productivity",
      color: "green",
      features: [
        "Generate meeting summaries and action items.",
        "Automate routine document creation and updates.",
        "Streamline cross-team communication and workflows.",
        "Transform raw data into structured reports.",
      ],
      visualSrc: "/static/landing/functions/productivity.png",
      href: "/home/solutions/productivity",
    },
    {
      title: "People",
      color: "rose",
      features: [
        "Guide new hires through onboarding processes.",
        "Answer HR policy and benefits questions.",
        "Assist managers with employee feedback and development.",
        "Support recruitment and interview processes.",
      ],
      visualSrc: "/static/landing/functions/people.png",
      href: "/home/solutions/recruiting-people",
    },
    {
      title: "Legal",
      color: "blue",
      features: [
        "Review contracts and flag potential issues.",
        "Answer compliance and regulatory questions.",
        "Generate standard legal documents from templates.",
        "Track policy updates and ensure team awareness.",
      ],
      visualSrc: "/static/landing/functions/legal.png",
      href: "/home/solutions/legal",
    },
  ];

  return (
    <div className="w-full rounded-2xl">
      <CardCarousel
        title={
          <div className="flex w-full items-center justify-between">
            <H2 className="text-center text-3xl font-medium md:text-4xl xl:text-5xl">
              What agent will you use or create today?
            </H2>
          </div>
        }
      >
        {cards.map((card, index) => (
          <FunctionCard
            key={index}
            title={card.title}
            features={card.features}
            color={card.color}
            visualSrc={card.visualSrc}
            href={card.href}
          />
        ))}
      </CardCarousel>
    </div>
  );
}

export { FunctionsSection };
