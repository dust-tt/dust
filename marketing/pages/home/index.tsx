import { IntroSection } from "@marketing/components/home/content/Product/IntroSection";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import type { NewsItem } from "@marketing/lib/homepage_news";
import { fetchHomepageNews } from "@marketing/lib/homepage_news";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

interface HomeProps {
  news?: NewsItem[];
}

// Revalidate the homepage every 5 minutes so news edits in the Google
// Sheet propagate without a deploy. First request after staleness gets
// the cached version while a fresh one is generated in the background.
export async function getStaticProps() {
  const news = await fetchHomepageNews();
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      news,
    },
    revalidate: 300,
  };
}

export function Landing({ news }: HomeProps) {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust - Multiplayer AI for human-agent collaboration"
        description="Dust is where people and agents collaborate as co-contributors, so that work doesn't just get done – it gets rewired."
        pathname={router.asPath}
      />
      <IntroSection news={news} />
    </>
  );
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home({ news }: HomeProps) {
  return <Landing news={news} />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
