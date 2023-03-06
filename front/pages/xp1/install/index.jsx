import Head from "next/head";
import { Logo } from "../../../components/Logo";
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
      <main className="mx-4">
        <div className="mx-8">
          <Logo />
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

        <div className="mx-auto mt-12 leading-16">
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
