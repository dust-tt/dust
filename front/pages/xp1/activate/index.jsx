import Head from "next/head";
import Script from "next/script";
import { useEffect, useState } from "react";

import { HighlightButton } from "@app/components/Button";
import { Logo } from "@app/components/Logo";

const { GA_TRACKING_ID = null } = process.env;

export default function Activate({ ga_tracking_id }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [disable, setDisabled] = useState(true);

  const formValidation = () => {
    if (!email || email.length === 0) return false;
    if (!name || name.length === 0) return false;

    var r = /^\w+([\+\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(r)) {
      return false;
    }

    return true;
  };

  useEffect(() => {
    setDisabled(!formValidation());
  }, [email, name]);

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
          <div className="text-center font-bold text-gray-900">
            Please submit your name and email to receive your activation key.
          </div>
        </div>

        <div className="mt-8 flex flex-row">
          <div className="flex flex-1"></div>
          <form
            action={`/api/xp1/send_activation_key`}
            method="POST"
            className="flex flex-initial space-y-8 divide-y divide-gray-200"
          >
            <div className="flex flex-col space-y-2">
              <div className="flex flex-initial">
                <div className="w-16 rounded-l border border-gray-800 bg-gray-800 px-2 py-1 text-white">
                  Name
                </div>
                <input
                  type="text"
                  name="name"
                  placeholder="John Doe"
                  className="rounded-r border border-gray-700 bg-gray-700 py-1 px-2 font-bold text-white focus:border-transparent focus:outline-none focus:ring-0 focus:ring-violet-600"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-initial">
                <div className="w-16 rounded-l border border-gray-800 bg-gray-800 px-2 py-1 text-white">
                  Email
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="team@dust.tt"
                  className="rounded-r border border-gray-700 bg-gray-700 py-1 px-2 font-bold text-white focus:border-transparent focus:outline-none focus:ring-0 focus:ring-violet-600"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-initial">
                <div className="mt-4">
                  <HighlightButton type="submit" disabled={disable}>
                    Send Activation Key
                  </HighlightButton>
                </div>
              </div>
            </div>
          </form>
          <div className="flex flex-1"></div>
        </div>

        <div className="mx-auto mt-8">
          <div className="text-center text-sm text-gray-500">
            Once received, save it somewhere safe, you will need it to activate
            the extension.
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
