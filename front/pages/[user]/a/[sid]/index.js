import AppLayout from "../../../../components/app/AppLayout";
import Button from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../../../lib/utils";

const { URL } = process.env;

export default function Home({ apps }) {
  const { data: session } = useSession();

  return <AppLayout></AppLayout>;
}

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  // TODO(spolu): allow public viewing of apps

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  return {
    props: { session },
  };
}
