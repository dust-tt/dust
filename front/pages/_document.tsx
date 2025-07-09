import Document, { Head, Html, Main, NextScript } from "next/document";

const { NODE_ENV, REACT_SCAN } = process.env;

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          {NODE_ENV === "development" && REACT_SCAN === "true" && (
            // eslint-disable-next-line @next/next/no-sync-scripts
            <script src="https://unpkg.com/react-scan/dist/auto.global.js" />
          )}
          <base href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL} />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          {process.env.NEXT_PUBLIC_ENABLE_BOT_CRAWLING !== "true" && (
            <meta name="robots" content="noindex" />
          )}
        </Head>
        <body>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            ></iframe>
          </noscript>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
