import Head from "next/head";
import { Router, useRouter } from "next/router";
import { MDXProvider } from "@mdx-js/react";

import { Layout } from "@/components/Layout";
import * as mdxComponents from "@/components/mdx";
import { useMobileNavigationStore } from "@/components/MobileNavigation";

import "@/styles/tailwind.css";
import "focus-visible";

function onRouteChange() {
  useMobileNavigationStore.getState().close();
}

Router.events.on("hashChangeStart", onRouteChange);
Router.events.on("routeChangeComplete", onRouteChange);
Router.events.on("routeChangeError", onRouteChange);

export default function App({ Component, pageProps }) {
  let router = useRouter();

  return (
    <>
      <Head>
        {router.pathname === "/" ? (
          <title>Dust Documentation</title>
        ) : (
          <title>{`${pageProps.title} - Dust Documentation`}</title>
        )}
        <meta name="description" content={pageProps.description} />
        <link rel="shortcut icon" href="favicon.png" />
      </Head>
      <MDXProvider components={mdxComponents}>
        <Layout {...pageProps}>
          <Component {...pageProps} />
        </Layout>
      </MDXProvider>
    </>
  );
}
