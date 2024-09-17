export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/recruiting-people",
      permanent: true,
    },
  };
}

export default function RecruitingPeople() {}
