export async function getServerSideProps() {
  return {
    redirect: {
      destination: "https://dust.tt/jobs",
      permanent: true,
    },
  };
}

export default function Jobs() {}
