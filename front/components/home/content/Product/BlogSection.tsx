import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, P } from "@app/components/home/ContentComponents";

interface BlogSectionProps {
  headerColorFrom?: string;
  headerColorTo?: string;
}

export function BlogSection({
  headerColorFrom = "from-green-200",
  headerColorTo = "to-emerald-400",
}: BlogSectionProps) {
  return (
    <Grid gap="gap-8">
      <div className="col-span-12">
        <Carousel className="w-full">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <H2 from={headerColorFrom} to={headerColorTo}>
                Customer Stories
              </H2>
              <P size="lg">
                Leading enterprises are already transforming their operations
                with Dust.
              </P>
            </div>
            <div className="flex gap-4">
              <CarouselPrevious />
              <CarouselNext />
            </div>
          </div>

          <CarouselContent>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Qonto partners with Dust to upgrade its customer experience"
                content="Qonto streamlines operations with Dust's AI agents, saving 50,000 hours yearly."
                href="https://blog.dust.tt/qonto-dust-ai-partnership/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/11/qonto_dust.jpg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Malt cuts support ticket closing time by 50% with Dust"
                content="Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses."
                href="https://blog.dust.tt/malt-customer-support/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="How Vincent, Engineer at Alan, reduces project completion time by 20%"
                content="Discover how Alan's Engineering team built Dust agents to accelerate their workflows beyond coding."
                href="https://blog.dust.tt/integrating-ai-workflows-alan/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/12/alan_dust_customer_story_.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Pennylane's journey to deploy Dust for Customer Care teams"
                content="Dust evolved from a simple support tool into an integral part of Pennylane's operations."
                href="https://blog.dust.tt/pennylane-customer-support-journey/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Lifen uses Dust AI agents to boost team productivity"
                content="Lifen uses Dust AI agents to boost team productivity and save hours of work each week."
                href="https://blog.dust.tt/customer-story-lifen/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="PayFit Accelerates Content Creation and Knowledge Sharing with Dust"
                content="PayFit boosts efficiency with instant AI agents for knowledge sharing."
                href="https://blog.dust.tt/dust-ai-payfit-efficiency/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/12/payfit_dust_customer_story.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Kyriba accelerates innovation with Dust"
                content="Kyriba saves thousands of hours by turning AI agents into innovation catalysts."
                href="https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>
    </Grid>
  );
}
