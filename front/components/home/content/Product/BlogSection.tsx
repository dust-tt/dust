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
    title: "Qonto partners with Dust to upgrade its customer experience",
    content:
      "Qonto streamlines operations with Dust's AI agents, saving 50,000 hours yearly.",
    href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/11/qonto_dust.jpg",
  },
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
  },
  {
    title:
      "How Vincent, Engineer at Alan, reduces project completion time by 20%",
    content:
      "Discover how Alan's Engineering team built Dust agents to accelerate their workflows beyond coding.",
    href: "https://blog.dust.tt/integrating-ai-workflows-alan/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/12/alan_dust_customer_story_.png",
  },
  {
    title: "Pennylane's journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-customer-support-journey/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
  {
    title:
      "PayFit Accelerates Content Creation and Knowledge Sharing with Dust",
    content:
      "PayFit boosts efficiency with instant AI agents for knowledge sharing.",
    href: "https://blog.dust.tt/dust-ai-payfit-efficiency/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/12/payfit_dust_customer_story.png",
  },
  {
    title: "Kyriba accelerates innovation with Dust",
    content:
      "Kyriba saves thousands of hours by turning AI agents into innovation catalysts.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    imageUrl:
      "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
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
