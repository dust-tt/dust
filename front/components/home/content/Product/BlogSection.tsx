import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { BlogBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";

interface BlogPost {
  title: string;
  content: string;
  href: string;
  imageUrl: string;
}

const blogPosts: BlogPost[] = [
  {
    title: "How Clay is powering 4x team growth with Dust",
    content:
      "Clay uses Dust AI agents to scale their GTM team 4x while maintaining sales velocity and achieving 100% adoption across their growing team.",
    href: "/blog/clay-scaling-gtme-team",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
  },
  {
    title: "Doctolib uses Dust for AI adoption of 3,000 employees",
    content:
      "Doctolib achieved 70% weekly usage across 3,000 employees by treating AI transformation as a cultural imperative, not just tool deployment.",
    href: "/blog/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Doctolib-__-Dust---Part-1.jpg",
  },
  {
    title: "Qonto partners with Dust to upgrade its customer experience",
    content:
      "Qonto streamlines operations with Dust’s AI agents, saving 50,000 hours yearly.",
    href: "/blog/qonto-dust-ai-partnership",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
  },
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust’s AI platform for rapid, consistent multilingual responses.",
    href: "/blog/malt-customer-support",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/malt_dust.png",
  },
  {
    title:
      "How Vincent, Engineer at Alan, reduces project completion time by 20%",
    content:
      "Discover how Alan’s Engineering team built Dust agents to accelerate their workflows beyond coding.",
    href: "/blog/integrating-ai-workflows-alan",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1--1--1.png",
  },
  {
    title: "Pennylane’s journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane’s operations.",
    href: "/blog/pennylane-customer-support-journey",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Pennylane-__-Dust.jpg",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "/blog/customer-story-lifen",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Lifen-__-Dust.png",
  },
  {
    title:
      "PayFit Accelerates Content Creation and Knowledge Sharing with Dust",
    content:
      "PayFit boosts efficiency with instant AI agents for knowledge sharing.",
    href: "/blog/dust-ai-payfit-efficiency",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Payfit-__-Dust.png",
  },
  {
    title: "Kyriba accelerates innovation with Dust",
    content:
      "Kyriba saves thousands of hours by turning AI agents into innovation catalysts.",
    href: "/blog/kyriba-accelerating-innovation-with-dust",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2025/07/Kyriba-__-Dust.png",
  },
];

interface BlogSectionProps {
  className?: string;
}

export function BlogSection({ className = "" }: BlogSectionProps) {
  return (
    <div className={`w-full rounded-2xl ${className}`}>
      <Carousel className="w-full">
        <div className="mb-4 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="rounded-xl">
            <H2>Customer Stories</H2>
            <P size="lg" className="text-muted-foreground">
              Leading enterprises are already transforming their operations with
              Dust.
            </P>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <CarouselPrevious className="h-8 w-8 sm:h-10 sm:w-10" />
            <CarouselNext className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        </div>

        <CarouselContent className="-ml-4 rounded-xl">
          {blogPosts.map((post, index) => (
            <CarouselItem
              key={index}
              className="basis-full rounded-xl pl-8 sm:basis-1/2 lg:basis-1/3"
            >
              <BlogBlock
                title={post.title}
                content={post.content}
                href={post.href}
                className="overflow-hidden"
              >
                <img
                  src={post.imageUrl}
                  alt={`${post.title} thumbnail`}
                  className="aspect-video w-full object-cover"
                  style={{ borderRadius: 0 }}
                />
              </BlogBlock>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
