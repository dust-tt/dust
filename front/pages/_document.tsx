import Document, { Head, Html, Main, NextScript } from "next/document";

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
          <link href="https://use.typekit.net/jnb2umy.css" rel="stylesheet" />
        </Head>
        <body>
          <div className="relative z-50 flex w-full items-center justify-center border-b bg-warning-200 text-element-800">
            <div className="">
              <span className="font-bold">OpenAI outage:</span> OpenAI is
              encountering a{" "}
              <a
                href="https://status.openai.com/"
                target="_blank"
                className="underline"
              >
                full outage of their APIs
              </a>{" "}
              All our services are impacted except assistants with no retrieval
              based on Anthropic AI.
            </div>
          </div>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
