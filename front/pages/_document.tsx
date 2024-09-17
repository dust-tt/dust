import Document, { Head, Html, Main, NextScript } from "next/document";

const { ENABLE_BOT_CRAWLING } = process.env;

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          {ENABLE_BOT_CRAWLING !== "front" && (
            <meta name="robots" content="noindex" />
          )}
          <link href="https://use.typekit.net/jnb2umy.css" rel="stylesheet" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
