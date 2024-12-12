export async function getServerSideProps() {
  return {
    redirect: {
      destination: "https://jobs.ashbyhq.com/dust",
      permanent: true,
    },
  };
}

export default function Jobs() {}
