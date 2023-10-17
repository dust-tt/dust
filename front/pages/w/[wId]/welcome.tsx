import { Button, Input, RadioButton } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
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
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string>(user.name.split(" ")[0]);
  const [lastName, setLastName] = useState<string>(user.name.split(" ")[1]);
  const [expertise, setExpertise] = useState<string>(defaultExpertise);
  const [isFormValid, setIsFormValid] = useState<boolean>(false);
  const [isFormProcessed, setIsFormProcessed] = useState<boolean>(false);

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
    setIsFormProcessed(true);
  };

  if (!isFormProcessed) {
    return (
      <OnboardingLayout owner={owner} gaTrackingId={gaTrackingId}>
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-objektiv text-2xl font-bold tracking-tighter">
              <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                Hello {firstName}
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
            <p className="pb-2">
              How often do you use ChatGPT or other AI assistants?
            </p>
            <RadioButton
              name="expertise"
              className="flex-col sm:flex-row"
              choices={[
                {
                  label: "Never!",
                  value: "beginner",
                  disabled: false,
                },
                {
                  label: "Occasionally",
                  value: "intermediate",
                  disabled: false,
                },
                {
                  label: "Daily",
                  value: "advanced",
                  disabled: false,
                },
              ]}
              value={expertise}
              onChange={setExpertise}
            />
          </div>
          <div className="flex justify-center pt-6">
            <Button label="Ok" disabled={!isFormValid} onClick={handleSubmit} />
          </div>
        </div>
      </OnboardingLayout>
    );
  } else {
    return (
      <OnboardingLayout owner={owner} gaTrackingId={gaTrackingId}>
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-objektiv text-2xl font-bold tracking-tighter text-green-400 sm:font-objektiv md:font-objektiv">
              You're ready to go!
            </p>
            <p>Here is a 3 minutes video to get you started with Dust.</p>
          </div>
          <div>
            <YoutubeIframe youtubeId="NVIbCvfkO3E" />
          </div>
          <div className="flex justify-center">
            <Button
              label="Start with Dust!"
              disabled={!isFormValid}
              onClick={async () => {
                if (conversationId) {
                  await router.push(
                    `/w/${owner.sId}/assistant/${conversationId}`
                  );
                } else {
                  await router.push(`/w/${owner.sId}/assistant/new`);
                }
              }}
            />
          </div>
        </div>
      </OnboardingLayout>
    );
  }
}

const YoutubeIframe = ({ youtubeId }: { youtubeId: string }) => {
  return (
    <div
      className="video"
      style={{
        position: "relative",
        paddingBottom: "56.25%" /* 16:9 */,
        paddingTop: 25,
        height: 0,
      }}
    >
      <iframe
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
        src={`https://www.youtube.com/embed/${youtubeId}`}
        frameBorder="0"
      />
    </div>
  );
};
