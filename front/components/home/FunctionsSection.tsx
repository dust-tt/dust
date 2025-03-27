import React from "react";

import { H2 } from "@app/components/home/ContentComponents";
import { P } from "@app/components/home/ContentComponents";

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
        "Generate instant account snapshots to prepare for meetings",
        "Auto-complete RFPs and forms",
        "Create personalized outreach and follow-ups",
        "Coach sales reps with call insights",
      ],
      visualSrc: "/static/landing/functions/sales.png",
      href: "/home/solutions/sales",
    },
    {
      title: "Customer Support",
      color: "blue",
      features: [
        "Deflect tickets by integrating AI agents directly in your product",
        "Speed up ticket resolution from your staff",
        "Identify and anticipate customer needs",
        "Convert tickets into searchable knowledge base",
      ],
      visualSrc: "/static/landing/functions/customersupport.png",
      href: "/home/solutions/customer-support",
    },
    {
      title: "Marketing",
      color: "rose",
      features: [
        "Localize content in multiple languages with brand consistency",
        "Draft high-quality customer stories following company templates",
        "Create compelling social media copy",
        "Monitor industry and competitor news",
      ],
      visualSrc: "/static/landing/functions/marketing.png",
      href: "/home/solutions/marketing",
    },
    {
      title: "Engineering",
      color: "green",
      features: [
        "Get coding support and troubleshooting with relevant context",
        "Speed up incident resolution and communication",
        "Create instant team updates",
        "Surface relevant context and solutions from past incidents",
      ],
      visualSrc: "/static/landing/functions/engineering.png",
      href: "/home/solutions/engineering",
    },
    {
      title: "Data & Analytics",
      color: "blue",
      features: [
        "Enable teams to analyze data independently",
        "Write SQL queries from natural language",
        "Create instant data visualizations and analysis",
        "Answer data questions with documentation context",
      ],
      visualSrc: "/static/landing/functions/data.png",
      href: "/home/solutions/data-analytics",
    },
    {
      title: "Knowledge Management",
      color: "golden",
      features: [
        "Access company-wide knowledge instantly",
        "Find product information across knowledge bases",
        "Get answers in Slack with relevant context and citations",
        "Surface blockers from project discussions",
      ],
      visualSrc: "/static/landing/functions/knowledge.png",
      href: "/home/solutions/knowledge",
    },
    {
      title: "IT",
      color: "green",
      features: [
        "Answer employee IT questions instantly",
        "Guide system administrators through troubleshooting",
        "Streamline procurement processes",
        "Surface IT trends for proactive improvements",
      ],
      visualSrc: "/static/landing/functions/it.png",
      href: "/home/solutions/it",
    },
    {
      title: "Legal",
      color: "blue",
      features: [
        "Get instant legal guidance and answers",
        "Review contracts with expert insights",
        "Navigate legal research efficiently",
        "Generate compliant legal documents",
      ],
      visualSrc: "/static/landing/functions/legal.png",
      href: "/home/solutions/legal",
    },
    {
      title: "People",
      color: "rose",
      features: [
        "Answer recurring HR questions with information from your policies",
        "Onboard new hires through company processes and documentation",
        "Guide managers to deliver quality feedback based on your company guidelines",
      ],
      visualSrc: "/static/landing/functions/people.png",
      href: "/home/solutions/recruiting-people",
    },
    {
      title: "Productivity",
      color: "green",
      features: [
        "Generate instant meeting summaries",
        "Summarize complex documents quickly",
        "Polish communications professionally",
        "Get expert coaching on any topic",
      ],
      visualSrc: "/static/landing/functions/productivity.png",
      href: "/home/solutions/productivity",
    },
  ];

  return (
    <div className="w-full">
      <CardCarousel
        title={
          <div className="flex flex-col gap-4">
            <H2>Custom AI agents for every function</H2>
            <P size="lg" className="text-muted-foreground">
              Whether you're a developer, marketer, or data scientist, Dust
              helps you perform sophisticated tasks, automate processes and
              extract powerful insights faster than ever before.
            </P>
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
