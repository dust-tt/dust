import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import {
  CarousselContentBlock,
  HeaderContentBlock,
} from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import { SolutionSection } from "@app/components/home/SolutionSection";
import TrustedBy from "@app/components/home/TrustedBy";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.pyramid),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
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
  uptitle: "Marketing",
  title: (
    <>
      Go&nbsp;from&nbsp;insight to&nbsp;content in&nbsp;the&nbsp;blink
      of&nbsp;an&nbsp;eye
    </>
  ),
  from: "from-pink-200",
  to: "to-pink-500",
  description: (
    <>
      Leverage AI agents to&nbsp;gather market&nbsp;intelligence and
      customer&nbsp;insights, and to produce content faster.
    </>
  ),
};

export default function Marketing() {
  return (
    <>
      <HeaderContentBlock
        uptitle={"Dust for " + pageSettings.uptitle}
        title={pageSettings.title}
        from={pageSettings.from}
        to={pageSettings.to}
        subtitle={pageSettings.description}
      />
      <TrustedBy />
      <Grid>
        <SolutionSection
          title={
            <>
              Generate content fast
              <br />
              that remains on brand.
            </>
          }
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: <>Consistent content at&nbsp;last</>,
                  content: (
                    <>
                      Uses agents to&nbsp;ensure consistency across teams
                      and&nbsp;customer touchpoints. Leverage
                      your&nbsp;carefully crafted brand voice guidelines
                      and&nbsp;past content to&nbsp;support a&nbsp;quick
                      and&nbsp;intuitive creative process.
                    </>
                  ),
                },
                {
                  title: <>Cross-posting made easy</>,
                  content: (
                    <>
                      Generate inspired and&nbsp;aligned versions of&nbsp;your
                      content adapted to&nbsp;blogs, websites, product
                      documentation, and&nbsp;social media faster.
                    </>
                  ),
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[1],
                assistantExamples[3],
              ],
            },
          ]}
        />

        <SolutionSection
          title={<>AI&nbsp;Power-ups on&nbsp;tap.</>}
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: (
                    <>
                      Set up a&nbsp;live competitive
                      <br />
                      intelligence feed
                    </>
                  ),
                  content: [
                    <>
                      Leverage AI agents to&nbsp;keep tabs on&nbsp;your market
                      and&nbsp;its participants.
                    </>,
                    <>
                      Generate reports on&nbsp;competitors' moves to&nbsp;never
                      be&nbsp;caught off-guard and&nbsp;inform
                      your&nbsp;decisions.
                    </>,
                  ],
                },
                {
                  title: <>Man the&nbsp;battle card stations</>,
                  content: [
                    <>
                      Bridge the&nbsp;gap with Sales, Product, and&nbsp;Support
                      teams by&nbsp;translating marketing decisions, objectives,
                      and&nbsp;strategies into their&nbsp;language.
                    </>,
                    <>
                      Easily generate content and&nbsp;insights leveraging
                      competitive intelligence and&nbsp;the positioning you've
                      decided on.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[2],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
      </Grid>
      <BlogSection
        headerColorFrom="from-pink-200"
        headerColorTo="from-pink-300"
      />
    </>
  );
}

Marketing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🖋️",
    name: "@contentWriter",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Creates content based on best-in class &nbsp;examples availble
        internally
      </>
    ),
  },
  {
    emoji: "🖇️",
    name: "@crossPost",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Generates versioned&nbsp;content for social media outlets taking into
        account company guidelines
      </>
    ),
  },
  {
    emoji: "♠️",
    name: "@battleCard",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Generates arguments for your product in comparison to a specific
        competitor, in line with internal product guidelines and category
        positioning
      </>
    ),
  },
  {
    emoji: "🌍",
    name: "@internationalizer",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Transcreate all your content to adapt content for international markets
      </>
    ),
  },
  {
    emoji: "⭐️",
    name: "@marketing",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Answer any question about your&nbsp;team's marketing knowledge base.
        Resurface past ideas and&nbsp;create new ones
      </>
    ),
  },
  {
    emoji: "🧐",
    name: "@competitive",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Tracks competitors websites to highlight changes and pro-actively detect
        market positioning opportunities
      </>
    ),
  },
];

export function MarketingCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples.slice(0, 4)}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/marketing"
    />
  );
}
