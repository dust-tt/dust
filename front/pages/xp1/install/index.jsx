import Head from "next/head";
import Script from "next/script";
import { useEffect, useState } from "react";

import { HighlightButton } from "@app/components/Button";
import { Logo } from "@app/components/Logo";

const { GA_TRACKING_ID = null } = process.env;

export default function InstallExtension({ ga_tracking_id }) {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    (async () => {
      let verRes = await fetch(`/api/xp1/version`);
      let version = await verRes.json();
      setVersion(version);
    })();
  }, []);

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

        <div className="mt-12">
          <div className="flex flex-row items-center">
            <div className="mx-auto flex flex-row">
              <div className="flex">
                <a href={version ? version.download_url : "#"}>
                  <HighlightButton>Install Extension</HighlightButton>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-2">
          <div className="text-center text-sm text-gray-500">
            {version ? version.version : ""}
          </div>
        </div>

        <div className="leading-16 mx-auto mt-12">
          <div className="mx-auto max-w-xl text-sm text-gray-900">
            <div className="rounded-t bg-gray-800 px-3 py-2 text-gray-200">
              Instructions:
            </div>
            <div className="rounded-b bg-gray-700 py-2 pl-3 pr-1 text-white">
              <ul>
                <li>
                  1.{" "}
                  <a
                    href={version ? version.download_url : "#"}
                    className="font-bold"
                  >
                    Install/Update Extension
                  </a>{" "}
                  from the Chrome Web Store.
                </li>
                <li>
                  2. Optionally remap the extension shortcut by visiting
                  chrome://extensions/shortcuts
                </li>
              </ul>
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
    },
  };
}
