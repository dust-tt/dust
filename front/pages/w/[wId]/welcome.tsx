import { Button, Input, RadioButton } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { getUserMetadata } from "@app/lib/api/user";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  defaultExpertise: string;
  conversationId: string | null;
  gaTrackingId: string;
  baseUrl: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser() || !user) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const expertise = await getUserMetadata(user, "expertise");

  // If user was in onboarding flow "domain_conversation_link"
  // We will redirect to the conversation page after onboarding.
  const conversationId =
    typeof context.query.cId === "string" ? context.query.cId : null;

  return {
    props: {
      user,
      owner,
      defaultExpertise: expertise?.value || "",
      conversationId,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Welcome({
  user,
  owner,
  defaultExpertise,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string>(user.name.split(" ")[0]);
  const [lastName, setLastName] = useState<string>(user.name.split(" ")[1]);
  const [expertise, setExpertise] = useState<string>(defaultExpertise);
  const [isFormValid, setIsFormValid] = useState<boolean>(false);

  useEffect(() => {
    setIsFormValid(
      firstName.length > 0 && lastName.length > 0 && expertise !== ""
    );
  }, [firstName, lastName, expertise]);

  const handleSubmit = async () => {
    const updateUserFullNameRes = await fetch("/api/user", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ firstName, lastName }),
    });
    if (updateUserFullNameRes.ok) {
      await fetch("/api/user/metadata/expertise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: expertise }),
      });
    }
    // We don't block the user if it fails here.
    if (conversationId) {
      await router.push(`/w/${owner.sId}/assistant/${conversationId}`);
    } else {
      await router.push(`/w/${owner.sId}/assistant/new`);
    }
  };

  return (
    <div className="s-dark h-full bg-slate-800 text-slate-200">
      <main className="z-10 mx-auto max-w-4xl px-6 pt-24">
        <div className="flex flex-col gap-6">
          <div>
            <p className="mt-16 font-objektiv text-2xl font-bold tracking-tighter">
              <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                Hello {user.username}
              </span>
              <br />
              Let's check a few things.
            </p>
          </div>
          <div>
            <p>
              Your email is <span className="font-bold">{user.email}</span>.
            </p>
          </div>
          <div>
            <p className="pb-2">Your name is:</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                name="firstName"
                placeholder=""
                value={firstName}
                onChange={setFirstName}
              />
              <Input
                name="lastName"
                placeholder=""
                value={lastName}
                onChange={setLastName}
              />
            </div>
          </div>
          <div>
            <p className="pb-2">How much do you know about AI assistants?</p>
            <RadioButton
              name="expertise"
              className="flex-col sm:flex-row"
              choices={[
                {
                  label: "Nothing!",
                  value: "beginner",
                  disabled: false,
                },
                {
                  label: "I know the basics",
                  value: "intermediate",
                  disabled: false,
                },
                {
                  label: "I'm a pro",
                  value: "advanced",
                  disabled: false,
                },
              ]}
              value={expertise}
              onChange={setExpertise}
            />
          </div>
          <div className="flex justify-center pt-6">
            <Button
              label="Start with Dust!"
              disabled={!isFormValid}
              onClick={handleSubmit}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
