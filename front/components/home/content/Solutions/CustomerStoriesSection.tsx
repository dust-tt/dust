import type { FC } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, P } from "@app/components/home/ContentComponents";

export interface CustomerStory {
  title: string;
  content: string;
  href: string;
  src: string;
}

export interface QuoteProps {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface CustomerStoriesSectionProps {
  title?: string;
  subtitle?: string;
  stories: CustomerStory[];
}

const defaultCustomerStories: CustomerStory[] = [
  {
    title: "Doctolib uses Dust for AI adoption of 3,000 employees",
    content:
      "Doctolib achieved 70% weekly usage across 3,000 employees by treating AI transformation as a cultural imperative, not just tool deployment.",
    href: "https://blog.dust.tt/why-doctolib-made-company-wide-enterprise-ai-a-national-cause/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Doctolib-__-Dust---Part-1.jpg",
  },
  {
    title: "How Clay is powering 4x team growth with Dust",
    content:
      "Clay uses Dust AI agents to scale their GTM team 4x while maintaining sales velocity and achieving 100% adoption across their growing team.",
    href: "https://blog.dust.tt/clay-scaling-gtme-team/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
  },
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust’s AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/malt_dust.png",
  },
  {
    title: "Pennylane’s journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-dust-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Pennylane-__-Dust.jpg",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Lifen-__-Dust.png",
  },
];

export const CustomerStoriesSection: FC<CustomerStoriesSectionProps> = ({
  title = "Customer stories",
  subtitle = "Leading enterprises are already transforming their operations with Dust.",
  stories = defaultCustomerStories,
}) => (
  <Grid gap="gap-8">
    <div className="col-span-11 mt-16 sm:col-span-12">
      <Carousel className="w-full">
        <div className="mb-4 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="rounded-xl">
            <H2>{title}</H2>
            <P size="lg" className="text-muted-foreground">
              {subtitle}
            </P>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <CarouselPrevious className="h-8 w-8 sm:h-10 sm:w-10" />
            <CarouselNext className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        </div>

        <CarouselContent className="-ml-4 rounded-xl">
          {stories.map((story, index) => (
            <CarouselItem
              key={index}
              className="basis-full rounded-xl pl-8 sm:basis-1/2 lg:basis-1/3"
            >
              <BlogBlock
                title={story.title}
                content={story.content}
                href={story.href}
                className="overflow-hidden"
              >
                <img
                  src={story.src}
                  alt={`${story.title} thumbnail`}
                  className="aspect-video w-full object-cover"
                  style={{ borderRadius: 0 }}
                />
              </BlogBlock>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  </Grid>
);
