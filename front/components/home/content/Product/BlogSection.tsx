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
                Dust in Action:
                <br />
                Customer Stories
              </H2>
              <P size="lg">
                Discover how our customers augment their&nbsp;workflows
                with&nbsp;Dust.
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
                content="Qonto streamlines operations with Dust's AI assistants, saving 50,000 hours yearly."
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
                content="Discover how Alan's Engineering team built Dust assistants to accelerate their workflows beyond coding."
                href="https://blog.dust.tt/integrating-ai-workflows-alan/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/07/blog_alan.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Pennylane's journey to deploy Dust for Customer Care teams"
                content="Dust evolved from a simple support tool into an integral part of Pennylane's operations."
                href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/07/blog_penny.png"
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
