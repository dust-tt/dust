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
import { SolutionSection } from "@app/components/home/SolutionSection";
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
  title: (
    <>
      Instant knowledge,
      <br />
      exceptional support.
    </>
  ),
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
        {/* <Div3D
          depth={150}
          className="absolute top-0 flex h-full w-full items-center justify-center"
        >
          <Button
            icon={PlayIcon}
            variant="highlight"
            size="md"
            label="Watch Product Tour"
            className="shadow-xl"
            onClick={() => setIsVideoOpen(true)}
          />
        </Div3D> */}
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

      <Grid>
        <div
          className={classNames(
            "col-span-12 justify-center",
            "mt-36 flex flex-col gap-8 lg:min-h-[50vh]",
            "lg:col-span-5 lg:py-20",
            "2xl:col-span-5 2xl:col-start-2",
            "text-center lg:text-left"
          )}
        >
          <div className="flex w-full px-8 md:px-20 lg:hidden">
            {MainVisualImage()}
          </div>
          <H1 from={pageSettings.from} to={pageSettings.to}>
            {pageSettings.title}
          </H1>
          <P size="lg" className="text-slate-50">
            {pageSettings.description}
          </P>
          <div>
            <Link href="/home/pricing" shallow={true}>
              <Button
                variant="highlight"
                size="md"
                label="Get started"
                icon={RocketIcon}
              />
            </Link>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 mx-auto px-8 py-6 sm:max-w-[100%] md:max-w-[90%]",
            "lg:col-span-7 lg:col-start-6 lg:h-[100%] lg:max-w-[100%]",
            "2xl:col-span-6",
            "hidden lg:block"
          )}
        >
          <div className="flex h-full w-full items-center justify-center pt-36 xl:px-8">
            {MainVisualImage()}
          </div>
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
                  Save 8&nbsp;hours per&nbsp;agent per&nbsp;week on&nbsp;average
                </>
              ),
            },
          ]}
          from="from-amber-200"
          to="to-amber-500"
        />

        <TrustedBy />

        <SolutionSection
          title={<>Exceed customer&nbsp;expectations.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>Parse tickets and&nbsp;get to&nbsp;resolution faster</>
                  ),
                  content: [
                    <>
                      Allow agents to&nbsp;understand customer messages
                      and&nbsp;technical errors faster and&nbsp;in
                      50+&nbsp;languages.
                    </>,
                    <>
                      Build AI assistants based on&nbsp;company knowledge
                      and&nbsp;past support interactions to&nbsp;bring
                      the&nbsp;company's collective intelligence to&nbsp;the
                      support team's fingertips.
                    </>,
                  ],
                },
                {
                  title: (
                    <>Keep your&nbsp;team up-to-date at&nbsp;all&nbsp;times</>
                  ),
                  content: [
                    <>Break down information silos.</>,
                    <>
                      Give your frontline team access to&nbsp;up-to-date
                      information on&nbsp;projects, ongoing product incidents
                      or&nbsp;issues to&nbsp;help them&nbsp;take action
                      thoughtfully.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
        <SolutionSection
          title="Elevated team collaboration."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>
                      Bring new team members
                      <br />
                      up-to-speed&nbsp;fast
                    </>
                  ),
                  content: [
                    <>
                      Reduce your&nbsp;onboarding and&nbsp;training time
                      drastically.
                    </>,
                    <>
                      Put your&nbsp;documentation on&nbsp;processes
                      and&nbsp;methods to&nbsp;work to&nbsp;help the&nbsp;team
                      learn autonomously.
                    </>,
                  ],
                },
                {
                  title: (
                    <>
                      Maintain visibility
                      <br />
                      on&nbsp;customer needs
                    </>
                  ),
                  content: [
                    <>
                      Surface insights from&nbsp;interactions with customers
                      to&nbsp;your Support, Success and&nbsp;Product teams.
                    </>,
                    <>
                      Maintain a&nbsp;continuous understanding of&nbsp;customer
                      needs to inform your&nbsp;product priorities.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[2]],
            },
          ]}
        />

        {/* <SolutionSection
          title="Top customer support use-cases."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Resolve faster</>,
                  content: [
                    <>
                      Surface relevant information from all connected knowledge
                      bases instantly and understand messages in 50+ languages.
                    </>,
                  ],
                },
                {
                  title: <>Boost team productivity</>,
                  content: [
                    <>
                      Keep teams synchronized with real-time access to
                      information across all communication channels and reduce
                      onboarding times.
                    </>,
                  ],
                },
                {
                  title: <>Understand customer needs</>,
                  content: [
                    <>
                      Gain insights from coss-tool interactions to undertstand
                      and act on customer needs, improve documentation.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[1],
                assistantExamples[2],
                assistantExamples[3],
              ],
            },
          ]}
        /> */}

        <Quote
          quote="We’re managing a&nbsp;higher volume of&nbsp;tickets and have cut processing time—from an&nbsp;average of 6&nbsp;minutes per ticket to&nbsp;just a&nbsp;few seconds."
          name="Anaïs Ghelfi"
          title="Head of Data Platform at Malt"
          logo="/static/landing/logos/malt.png"
        />

        <div
          className={classNames(
            "flex flex-col gap-8",
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 from={pageSettings.from} to={pageSettings.to}>
            How&nbsp;Dust boosts support teams&nbsp;at:
          </H2>
        </div>
        <div className="col-span-12 flex flex-col items-center gap-4">
          <Carousel className="w-full">
            <div className="flex w-full flex-row justify-center gap-4">
              <CarouselPrevious />
              <CarouselNext />
            </div>
            <CarouselContent>
              <CarouselItem className="basis-full px-12 md:basis-1/2 md:px-6 lg:basis-1/3">
                <BlogBlock
                  title="How Eléonore, Care Team Lead at Pennylane, Uses Dust"
                  content="Discover how November Five leverages AI with Dust to enhance efficiency and maintain a human touch in their digital solutions."
                  href="https://blog.dust.tt/november-five-ai-transformation-dust/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/04/DSCF6552-1.jpeg"
                    alt="Blog Image"
                  />
                </BlogBlock>
              </CarouselItem>
              <CarouselItem className="basis-full px-6 md:basis-1/2 lg:basis-1/3">
                <BlogBlock
                  title="How Eléonore improved the efficiency of Pennylane’s Care team thanks to Dust"
                  content="Discover how Pennylane leveraged Dust’s specialized virtual assistants to improve efficiency and optimize workflows."
                  href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/04/Ele-onore-MOTTE--1--1.jpg"
                    alt="Blog Image"
                  />
                </BlogBlock>
              </CarouselItem>
              <CarouselItem className="basis-full px-6 md:basis-1/2 lg:basis-1/3">
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
            </CarouselContent>
          </Carousel>
        </div>
      </Grid>
    </>
  );
}

// const assistantExamples: SolutionSectionAssistantBlockProps[] = [
//   {
//     emoji: "🔍",
//     name: "@ticketResolution",
//     backgroundColor: "bg-sky-300",
//     description: (
//       <>Smart answer suggestions and contextual knowledge at your fingertips.</>
//     ),
//   },
//   {
//     emoji: "🎓",
//     name: "@agentCoaching",
//     backgroundColor: "bg-sky-300",
//     description: (
//       <>
//         Helps new support agents learn bst practices and company knowledge
//         faster.
//       </>
//     ),
//   },
//   {
//     emoji: "📝",
//     name: "@documentationBuilder",
//     backgroundColor: "bg-sky-300",
//     description: (
//       <>
//         Converts resolved support tickets into searchable knowledge base
//         articles and FAQ.
//       </>
//     ),
//   },
//   {
//     emoji: "📢",
//     name: "@customerVoice",
//     backgroundColor: "bg-sky-300",
//     description: (
//       <>Turn customer feedback from every channel into actionable insights.</>
//     ),
//   },
// ];

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
