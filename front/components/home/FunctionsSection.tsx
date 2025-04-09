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
      title: "RevOps & Sales",
      color: "green",
      features: [
        "Create customer profiles from CRM, notes, and emails",
        "Flag at-risk deals and identify failure trends",
        "Analyze calls to improve pitches and understand blockers",
        "Generate SQL from natural language for real-time metrics",
      ],
      visualSrc: "/static/landing/functions/sales.png",
      href: "/home/solutions/sales",
    },
    {
      title: "PMM & Marketing",
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
        "Provide real-time guidance based on best practices",
      ],
      visualSrc: "/static/landing/functions/customersupport.png",
      href: "/home/solutions/customer-support",
    },
    {
      title: "Product & Design",
      color: "golden",
      features: [
        "Improve product copy per company guidelines",
        "Analyze customer sentiment across platforms",
        "Extract competitor insights automatically",
        "Generate and refine user stories",
      ],
      visualSrc: "/static/landing/functions/product and design.png",
      href: "/home/solutions/product",
    },
    {
      title: "Engineering",
      color: "green",
      features: [
        "Review code against internal standards",
        "Auto-create docs from code and comments",
        "Compile incident timelines and draft postmortems",
        "Generate SQL from natural language",
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
