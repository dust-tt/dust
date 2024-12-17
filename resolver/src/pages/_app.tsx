import type { NextPage } from "next";
import type { AppProps } from "next/app";
import AppLayout from "@app/src/components/Layout";
import React from "react";

// Define types for pages with layouts
export type NextPageWithLayout<P = unknown, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: React.ReactElement, pageProps: P) => React.ReactNode;
};

export type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  if (Component.getLayout) {
    return Component.getLayout(<Component {...pageProps} />, pageProps);
  }
  return (
    <AppLayout>
      <Component {...pageProps} />
    </AppLayout>
  );
}
