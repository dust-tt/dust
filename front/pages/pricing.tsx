export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/pricing",
      permanent: true,
    },
  };
}

export default function Pricing() {}
