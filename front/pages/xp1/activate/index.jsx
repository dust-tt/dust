const { XP1_STRIPE_API_KEY, XP1_STRIPE_PRICE_ID, URL } = process.env;

export default function Activate({}) {
  return <></>;
}

export async function getServerSideProps(context) {
  const stripe = require("stripe")(XP1_STRIPE_API_KEY);

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: XP1_STRIPE_PRICE_ID }],
    mode: "subscription",
    success_url: `${URL}/xp1/activate/success?stripe_checkout_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${URL}/xp1`,
  });

  if (session) {
    return {
      redirect: {
        destination: session.url,
        permanent: false,
      },
    };
  } else {
    return {
      redirect: {
        destination: `${URL}/xp1`,
        permanent: false,
      },
    };
  }
}
