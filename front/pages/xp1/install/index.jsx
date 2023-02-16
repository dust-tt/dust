import Head from "next/head";
import { PulseLogo } from "../../../components/Logo";
import { HighlightButton } from "../../../components/Button";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function InstallExtension() {
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
      <main className="w-full">
        <div className="mx-8 mt-8">
          <Link href="/xp1">
            <div className="flex">
              <div className="flex flex-row items-center mx-auto pr-2">
                <div className="flex">
                  <PulseLogo animated={true} />
                </div>
                <div className="flex ml-2 font-bold text-2xl text-gray-800">
                  XP1
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-12">
          <div className="flex flex-row items-center">
            <div className="flex flex-row mx-auto">
              <div className="flex">
                <a href={version ? version.download_url : "#"}>
                  <HighlightButton>Install Extension</HighlightButton>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-2">
          <div className="text-sm text-gray-500 text-center">
            {version ? version.version : ""}
          </div>
        </div>

        <div className="mx-auto mt-8 leading-16">
          <div className="text-gray-900 text-sm max-w-xl mx-auto">
            <div className="bg-gray-800 text-gray-200 rounded-t py-2 px-3">
              Instructions:
            </div>
            <div className="py-2 pl-3 pr-1 bg-gray-700 text-white rounded-b">
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
      </main>
    </>
  );
}
