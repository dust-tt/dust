import Head from "next/head";
import { HighlightButton } from "@app/components/Button";
import { Logo } from "@app/components/Logo";
import Script from "next/script";

const { GA_TRACKING_ID = null, XP1_CHROME_WEB_STORE_URL } = process.env;

export default function ActivateSuccess({ ga_tracking_id, chrome_web_store_url }) {
  return (
    <>
      <Head>
        <title>Dust - XP1</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>

      <main className="mx-4">
        <div className="mx-8">
          <Logo />
        </div>

        <div className="mx-auto mt-12">
          <div className="text-gray-900 font-bold text-center">Thank you!</div>
        </div>

        <div className="mx-auto mt-8">
          <div className="text-sm text-gray-500 text-center">
            <span className="font-bold">
              This activation key was sent to your email address.
            </span>
          </div>
        </div>

        <div className="mt-12">
          <div className="flex flex-row items-center">
            <div className="flex flex-row mx-auto">
              <div className="flex">
                <div className="">
                  <a href={chrome_web_store_url}>
                    <HighlightButton>Install Extension</HighlightButton>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga_tracking_id}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
             window.dataLayer = window.dataLayer || [];
             function gtag(){window.dataLayer.push(arguments);}
             gtag('js', new Date());

             gtag('config', '${ga_tracking_id}');
            `}
          </Script>
        </>
      </main>
    </>
  );
}

export async function getServerSideProps(context) {
  return {
    props: {
      ga_tracking_id: GA_TRACKING_ID,
      chrome_web_store_url: XP1_CHROME_WEB_STORE_URL,
    },
  };
}
