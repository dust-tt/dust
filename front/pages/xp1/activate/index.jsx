import Head from "next/head";
import Script from "next/script";
import { Logo } from "../../../components/Logo";
import { HighlightButton } from "../../../components/Button";
import { useEffect, useState } from "react";

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
          <div className="text-gray-900 font-bold text-center">
            Please submit your name and email to receive your activation key.
          </div>
        </div>

        <div className="mt-8 flex flex-row">
          <div className="flex flex-1"></div>
          <form
            action={`/api/xp1/send_activation_key`}
            method="POST"
            className="space-y-8 divide-y divide-gray-200 flex flex-initial"
          >
            <div className="flex flex-col space-y-2">
              <div className="flex flex-initial">
                <div className="bg-gray-800 text-white border border-gray-800 rounded-l px-2 py-1 w-16">
                  Name
                </div>
                <input
                  type="text"
                  name="name"
                  placeholder="John Doe"
                  className="py-1 px-2 bg-gray-700 text-white font-bold border border-gray-700 rounded-r focus:outline-none focus:ring-0 focus:ring-violet-600 focus:border-transparent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-initial">
                <div className="bg-gray-800 text-white border border-gray-800 rounded-l px-2 py-1 w-16">
                  Email
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="team@dust.tt"
                  className="py-1 px-2 bg-gray-700 text-white font-bold border border-gray-700 rounded-r focus:outline-none focus:ring-0 focus:ring-violet-600 focus:border-transparent"
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
          <div className="text-sm text-gray-500 text-center">
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
