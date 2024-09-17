export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/pricing",
      permanent: true,
    },
  };
}

export default function Pricing() {}
