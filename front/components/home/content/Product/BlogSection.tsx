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

export function BlogSection() {
  return (
    <Grid gap="gap-8">
      <div className="col-span-12">
        <Carousel className="w-full">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <H2 from="from-green-200" to="to-emerald-400">
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
                title="Navigating Growth and Innovation with November Five's Dario Prskalo"
                content="Discover how November Five leverages AI with Dust to enhance efficiency and maintain a human touch in their digital solutions."
                href="https://blog.dust.tt/november-five-ai-transformation-dust/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/07/blog_nov.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="How Eléonore improved the efficiency of Pennylane's Care team thanks to Dust"
                content="Discover how Pennylane leveraged Dust's specialized virtual assistants to improve efficiency and optimize workflows."
                href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/07/blog_penny.png"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Integrating AI for Enhanced Workflows at Alan"
                content="Discover how Alan revolutionizes healthcare and enhances workflows using AI. See how @code-help and Dust streamline developer tasks."
                href="https://blog.dust.tt/integrating-ai-workflows-alan/"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/07/blog_alan.png"
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
