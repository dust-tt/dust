export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/recruiting-people",
      permanent: true,
    },
  };
}

export default function RecruitingPeople() {}
