import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { UseCasesSection } from "@app/components/home/content/Product/SupportUseCasesSection";

import {
  BlogBlock,
  CarousselContentBlock,
  MetricComponent,
  Quote,
} from "@app/components/home/ContentBlocks";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import { BenefitsSection } from "@app/components/home/content/Product/SupportBenefitsSection";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
    },
  };
}

interface pageSettingsProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  from: string;
  to: string;
}

const pageSettings: pageSettingsProps = {
  uptitle: "Customer Support",
  title: <>Instant knowledge, exceptional support.</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate issue
      resolution and&nbsp;increase customer satisfaction.
    </>
  ),
};

export default function CustomerSupport() {
  const MainVisualImage = () => (
    <>
      <Hover3D depth={-40} perspective={1000} className="relative">
        <Div3D depth={-30}>
          <img src="/static/landing/support/support1.png" alt="MainVisual1" />
        </Div3D>
        <Div3D depth={-10} className="absolute top-0">
          <img src="/static/landing/support/support2.png" alt="MainVisual2" />
        </Div3D>
        <Div3D depth={20} className="absolute top-0">
          <img src="/static/landing/support/support3.png" alt="MainVisual3" />
        </Div3D>
        <Div3D depth={50} className="absolute top-0">
          <img src="/static/landing/support/support4.png" alt="MainVisual4" />
        </Div3D>
      </Hover3D>
    </>
  );
  return (
    <>
      {/* <HeaderContentBlock
        uptitle={"Dust for " + pageSettings.uptitle}
        title={pageSettings.title}
        from={pageSettings.from}
        to={pageSettings.to}
        subtitle={pageSettings.description}
      /> */}
      <div className="container flex w-full flex-col gap-16 px-6 py-24 pb-12 xl:gap-28 2xl:gap-36">
        <Grid>
          {/* <div
          className={classNames(
            "col-span-8 justify-center",
            "flex flex-col gap-8 pt-24 lg:min-h-[50vh]",
            "lg:col-span-5 lg:py-10",
            "2xl:col-span-5 2xl:col-start-2",
            "text-center lg:text-left"
          )}
        > */}
          <div
            className={classNames(
              "col-span-12 mx-auto py-4 pt-12 sm:max-w-[100%] md:max-w-[90%]",
              "lg:col-span-6 lg:col-start-1 lg:h-[100%] lg:max-w-[100%]",
              "2xl:col-span-6",
              "flex flex-col justify-center"
            )}
          >
            <P size="lg">Dust for {pageSettings.uptitle}</P>
            <H1 from={pageSettings.from} to={pageSettings.to}>
              {pageSettings.title}
            </H1>
            <P size="lg" className="pb-6 text-slate-50">
              {pageSettings.description}
            </P>
            <div className="flex gap-4">
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Get started"
                  icon={RocketIcon}
                />
              </Link>
              <Button
                variant="outline"
                size="md"
                label="Talk to sales"
                href="https://forms.gle/dGaQ1AZuDCbXY1ft9"
                target="_blank"
              />
            </div>
          </div>
          <div
            className={classNames(
              "col-span-12 mx-auto px-4 py-4 pt-12 sm:max-w-[100%] md:max-w-[90%]",
              "lg:col-span-6 lg:col-start-7 lg:h-[100%] lg:max-w-[100%]",
              "2xl:col-span-6",
              "hidden lg:block"
            )}
          >
            <div className="flex h-full w-full items-center justify-center xl:px-8">
              {MainVisualImage()}
            </div>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <BenefitsSection />
          </div>
          <MetricComponent
            metrics={[
              {
                value: "15x",
                description: <>15x&nbsp;faster to craft an answer</>,
              },
              {
                value: "8h",
                description: (
                  <>
                    Save 8&nbsp;hours per&nbsp;agent per&nbsp;week
                    on&nbsp;average
                  </>
                ),
              },
            ]}
            from="from-amber-200"
            to="to-amber-500"
          />
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <UseCasesSection />
          </div>
          <div
            className={classNames(
              "flex flex-col justify-center gap-8 pb-4",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <div>
              <H2 from={pageSettings.from} to={pageSettings.to}>
                Dust in action
              </H2>
              {/* <P size="lg">See a demo of the Dust product.</P> */}
            </div>
            <Hover3D depth={-40} perspective={1000} className="relative w-full">
              <div className="relative w-full pt-[56.25%]">
                {" "}
                {/* 16:9 aspect ratio */}
                <iframe
                  src="https://fast.wistia.net/embed/iframe/7ynip6mgfx?seo=true&videoFoam=true"
                  title="Dust product tour"
                  allow="autoplay; fullscreen"
                  frameBorder="0"
                  className="absolute inset-0 h-full w-full rounded-lg"
                ></iframe>{" "}
              </div>
            </Hover3D>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <Quote
              quote="We’re managing a&nbsp;higher volume of&nbsp;tickets and have cut processing time—from an&nbsp;average of 6&nbsp;minutes per ticket to&nbsp;just a&nbsp;few seconds."
              name="Anaïs Ghelfi"
              title="Head of Data Platform at Malt"
              logo="/static/landing/logos/malt.png"
            />
            <Grid gap="gap-8">
              <div className="col-span-12">
                <Carousel className="w-full">
                  <div className="mb-6 flex items-end justify-between">
                    <div>
                      <H2 from={pageSettings.from} to={pageSettings.to}>
                        Customer stories
                      </H2>
                      {/* <P size="lg">
                      Discover how our customers augment their&nbsp;workflows
                      with&nbsp;Dust.
                    </P> */}
                    </div>
                    <div className="flex gap-4">
                      <CarouselPrevious />
                      <CarouselNext />
                    </div>
                  </div>

                  <CarouselContent>
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
                        title="Pennylane's journey to deploy Dust for Customer Care teams"
                        content="Dust evolved from a simple support tool into an integral part of Pennylane's operations."
                        href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
                      >
                        <img
                          src="https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png"
                          alt="Blog Image"
                        />
                      </BlogBlock>
                    </CarouselItem>
                    <CarouselItem className="basis-full md:basis-1/2 lg:basis-1/3">
                      <BlogBlock
                        title="Lifen uses Dust AI assistants to boost team productivity"
                        content="Lifen uses Dust AI assistants to boost team productivity and save hours of work each week."
                        href="https://blog.dust.tt/customer-story-lifen/"
                      >
                        <img
                          src="https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg"
                          alt="Blog Image"
                        />
                      </BlogBlock>
                    </CarouselItem>
                  </CarouselContent>
                </Carousel>
              </div>
            </Grid>
          </div>
          <TrustedBy />;
        </Grid>
      </div>
    </>
  );
}

CustomerSupport.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🤝",
    backgroundColor: "bg-sky-300",
    name: "@supportExpert",
    description: (
      <>
        Surfaces relevant information from&nbsp;your Help Center, FAQs,
        knowledge base, online documentation, and&nbsp;tickets. Understands
        errors codes without help from&nbsp;the tech&nbsp;team
      </>
    ),
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@productInfo",
    description: (
      <>
        Answer questions on&nbsp;product evolutions, engineering activity,
        alerts, and&nbsp;downtime
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@supportAnalyst",
    description: (
      <>
        Identifies patterns and&nbsp;sentiment in&nbsp;support interactions
        to&nbsp;highlight recurring needs and&nbsp;actionable initiatives based
        on&nbsp;the internal product team nomenclature and&nbsp;infrastructure
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@supportOnboarding",
    description: (
      <>
        Helps new members of&nbsp;the support team navigate the&nbsp;tools
        and&nbsp;processes in&nbsp;their first weeks to&nbsp;set them up for
        success
      </>
    ),
  },
  {
    emoji: "🚨",
    backgroundColor: "bg-sky-300",
    name: "@supportAlerts",
    description: (
      <>
        Connects to&nbsp;product and&nbsp;engineering communication channels
        to&nbsp;surface ongoing engineering activity, incidents or&nbsp;issues
        and&nbsp;highlight the&nbsp;possible impact on&nbsp;users
        and&nbsp;customers
      </>
    ),
  },
  {
    emoji: "😳",
    backgroundColor: "bg-sky-300",
    name: "@whatWouldUserDo",
    description: (
      <>
        Crafts training, product documentation and&nbsp;training materials
        through the&nbsp;eyes of&nbsp;your users to&nbsp;help improve content
        ahead of&nbsp;issues
      </>
    ),
  },
];

export function CustomerCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/customer-support"
    />
  );
}
