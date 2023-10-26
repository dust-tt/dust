import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";

export const getServerSideProps: GetServerSideProps<{
  hello: string;
}> = async (context) => {
  return {
    props: {
      hello: "world",
    },
  };
};

const PlansPage = ({
  hello,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
    </div>
  );
};

export default PlansPage;
