import { Button, ChevronLeftIcon, ChevronRightIcon } from "@dust-tt/sparkle";
import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@app/components/home/Caroussel";
import { BlogBlock } from "@app/components/home/components/contentBlocks";
import {
  Grid,
  H2,
  P,
  Strong,
} from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

export function BlogSection() {
  return (
    <Grid gap="gap-8">
      <div
        className={classNames(
          "flex flex-col gap-8",
          "col-span-12",
          "lg:col-span-10 lg:col-start-2",
          "xl:col-span-9 xl:col-start-2",
          "2xl:col-start-3"
        )}
      >
        <H2 from="from-green-200" to="to-emerald-400">
          Dust in Action:
          <br />
          Customer Stories
        </H2>
        <P size="lg">
          Discover how Dust is used by our customers to{" "}
          <Strong>improve their&nbsp;workflows</Strong>.
        </P>
      </div>
      <div className="col-span-12 flex flex-col items-center gap-4">
        <div className="flex gap-3">
          <Button
            icon={ChevronLeftIcon}
            label="Previous"
            labelVisible={false}
            variant="tertiary"
          />
          <Button
            icon={ChevronRightIcon}
            label="Next"
            labelVisible={false}
            variant="tertiary"
          />
        </div>
        <Carousel className="col-span-12">
          <CarouselContent>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Navigating Growth and Innovation with November Five’s Dario Prskalo"
                content="Discover how November Five leverages AI with Dust to enhance efficiency and maintain a human touch in their digital solutions."
                href="https://blog.dust.tt/november-five-ai-transformation-dust/"
                className="m-6 lg:m-4 xl:m-6"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/04/DSCF6552-1.jpeg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="How Eléonore improved the efficiency of Pennylane’s Care team thanks to Dust"
                content="Discover how Pennylane leveraged Dust’s specialized virtual assistants to improve efficiency and optimize workflows."
                href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
                className="m-6 lg:m-4 xl:m-6"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/04/Ele-onore-MOTTE--1--1.jpg"
                  alt="Blog Image"
                />
              </BlogBlock>
            </CarouselItem>
            <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
              <BlogBlock
                title="Integrating AI for Enhanced Workflows at Alan"
                content="Discover how Alan revolutionizes healthcare and enhances workflows using AI. See how @code-help and Dust streamline developer tasks."
                href="https://blog.dust.tt/integrating-ai-workflows-alan/"
                className="m-6 lg:m-4 xl:m-6"
              >
                <img
                  src="https://blog.dust.tt/content/images/size/w2000/2024/03/cover-vincent.png"
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
