import type { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";

import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/content/PublicInteractiveContentContainer";

interface SharedFilePageProps {
  shortToken: string;
}

export const getServerSideProps: GetServerSideProps<
  SharedFilePageProps
> = async (context) => {
  const { shortToken } = context.params as { shortToken: string };

  if (!shortToken || typeof shortToken !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      shortToken,
    },
  };
};

export default function SharedFilePage({ shortToken }: SharedFilePageProps) {
  return (
    <>
      <Head>
        <title>Interactive Content - Dust</title>
        <meta name="description" content="Shared interactive content" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>
      <div className="flex h-screen w-full">
        <PublicInteractiveContentContainer shareToken={shortToken} />
      </div>
    </>
  );
}
