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
      color: "green",
      features: [
        "Create account snapshots from past interactions and CRM data",
        "Generate targeted outreach using call transcripts and insights",
        "Answer prospect questions and RFPs with product and competitor insights",
        "Analyze calls to improve pitch delivery and objection handling",
      ],
      visualSrc: "/static/landing/functions/sales.png",
      href: "/home/solutions/sales",
    },
    {
      title: "Marketing",
      color: "rose",
      features: [
        "Write on-brand content in minutes",
        "Create consistent launch messaging",
        "Translate while maintaining brand voice",
        "Extract actionable insights from feedback",
      ],
      visualSrc: "/static/landing/functions/marketing.png",
      href: "/home/solutions/marketing",
    },
    {
      title: "Customer Support",
      color: "blue",
      features: [
        "Connect agents to knowledge base for instant responses",
        "Identify product improvements from ticket patterns",
        "Auto-create FAQs from resolved tickets",
        "Auto-route tickets based on queries and expertise",
      ],
      visualSrc: "/static/landing/functions/customersupport.png",
      href: "/home/solutions/customer-support",
    },
    {
      title: "Engineering",
      color: "green",
      features: [
        "Accelerate debugging using code context, docs, and issue history in your IDE",
        "Streamline incidents with automated runbooks, communication, and documentation",
        "Auto-review code to ensure standards and security compliance at scale",
        "Auto-generate and update documentation from code changes",
      ],
      visualSrc: "/static/landing/functions/engineering.png",
      href: "/home/solutions/engineering",
    },
    {
      title: "Data & Analytics",
      color: "blue",
      features: [
        "Enable non-technical teams to query company data",
        "Automate reporting from all data types",
        "Transform insights into visual stories",
        "Connect multiple data sources for unified analysis",
      ],
      visualSrc: "/static/landing/functions/data.png",
      href: "/home/solutions/data-analytics",
    },
  ];

  return (
    <div className="w-full rounded-2xl">
      <CardCarousel
        title={
          <div className="flex w-full items-center justify-between">
            <H2>What agent will you use or create today?</H2>
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
