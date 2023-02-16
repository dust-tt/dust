import Head from "next/head";
import { new_id } from "../../../lib/utils";
import { XP1User } from "../../../lib/models";
import { PulseLogo } from "../../../components/Logo";
import { HighlightButton } from "../../../components/Button";
import {
  ClipboardIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { sendActivationKey } from "../../../lib/sendgrid";

import { useState } from "react";

const { XP1_STRIPE_API_KEY, URL, XP1_CHROME_WEB_STORE_URL } = process.env;

export default function ActivateSuccess({ user, chrome_web_store_url }) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Head>
        <title>Dust - XP1</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>
      <main className="w-full">
        <div className="mx-8 mt-8">
          <Link href="/xp1" target="_blank">
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

        <div className="mx-auto mt-12">
          <div className="text-gray-900 font-bold text-center">Thank you!</div>
        </div>

        <div className="mx-auto mt-8 leading-16">
          <div className="text-gray-900 text-center">
            <span className="bg-gray-800 text-gray-200 rounded-l py-2 px-3">
              Activation Key
            </span>
            <span className="py-2 pl-3 pr-1 bg-gray-700 text-white font-bold">
              {user.secret}
            </span>
            <span className="bg-gray-700 text-gray-200 rounded-r py-2 px-2">
              {!copied ? (
                <ClipboardIcon
                  className="w-4 h-4 mb-1 inline cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(user.secret);
                    setCopied(true);
                    setTimeout(() => {
                      setCopied(false);
                    }, 500);
                  }}
                />
              ) : (
                <ClipboardDocumentCheckIcon className="w-4 h-4 mb-1 inline cursor-pointer" />
              )}
            </span>
          </div>
        </div>

        <div className="mx-auto mt-8">
          <div className="text-sm text-gray-500 text-center">
            <span className="font-bold">
              This activation key was also sent to you by email at {user.email}.
            </span>
            <br />
            Save it somewhere safe, you will need it to activate the extension.
          </div>
        </div>

        <div className="mt-12">
          <div className="flex flex-row items-center">
            <div className="flex flex-row mx-auto">
              <div className="flex">
                <div className="">
                  <a href={chrome_web_store_url} target="_blank">
                    <HighlightButton>Install Extension</HighlightButton>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps(context) {
  const stripe = require("stripe")(XP1_STRIPE_API_KEY);

  const session = await stripe.checkout.sessions.retrieve(
    context.query.stripe_checkout_session_id
  );

  if (session && session.status === "complete") {
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription
    );
    const customer = await stripe.customers.retrieve(subscription.customer);

    const item = subscription.items.data[0].id;

    console.log(`SUBSCRIPTION_CREATE`, {
      subscription: subscription.id,
      item: item,
      status: subscription.status,
      email: customer.email,
      name: customer.name,
    });

    let user = await XP1User.findOne({
      where: {
        stripeSubscription: session.subscription,
      },
    });

    if (!user) {
      let secret = `sk-${new_id().slice(0, 32)}`;
      user = await XP1User.create({
        secret,
        email: customer.email,
        name: customer.name,
        stripeSubscription: subscription.id,
        stripeSubscriptionStatus: subscription.status,
        stripeSubscriptionItem: item,
      });
      await sendActivationKey(user);
    } else {
      await user.update({
        stripeSubscriptionStatus: subscription.status,
        stripeSubscription: subscription.id,
        stripeSubscriptionItem: item,
      });
    }

    return {
      props: {
        user: {
          name: user.name,
          email: user.email,
          secret: user.secret,
        },
        chrome_web_store_url: XP1_CHROME_WEB_STORE_URL,
      },
    };
  }

  return {
    redirect: {
      destination: `${URL}/xp1`,
      permanent: false,
    },
  };
}
