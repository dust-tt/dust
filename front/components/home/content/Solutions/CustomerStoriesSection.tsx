import type { FC } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2 } from "@app/components/home/ContentComponents";

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
  stories: CustomerStory[];
}

export const defaultCustomerStories: CustomerStory[] = [
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
  },
  {
    title: "Pennylane's journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-dust-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];

export const CustomerStoriesSection: FC<CustomerStoriesSectionProps> = ({
  title = "Customer stories",
  stories = defaultCustomerStories,
}) => (
  <Grid gap="gap-8">
    <div className="col-span-11 mt-16 sm:col-span-12">
      <Carousel className="w-full">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <H2>{title}</H2>
          </div>
          <div className="flex gap-4">
            <CarouselPrevious />
            <CarouselNext />
          </div>
        </div>

        <CarouselContent className="-ml-8">
          {stories.map((story, index) => (
            <CarouselItem
              key={index}
              className="basis-full pl-8 md:basis-1/2 lg:basis-1/3"
            >
              <BlogBlock
                title={story.title}
                content={story.content}
                href={story.href}
                className="h-full"
              >
                <img src={story.src} alt={story.title} />
              </BlogBlock>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  </Grid>
);
