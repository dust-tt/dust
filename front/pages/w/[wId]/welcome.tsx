import {
  Button,
  Input,
  Logo,
  LogoSquareColorLogo,
  Page,
  RadioButton,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { getUserMetadata } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultGetServerSidePropsRequirements } from "@app/lib/iam/session";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

const ADMIN_YOUTUBE_ID = "f9n4mqBX2aw";
const MEMBER_YOUTUBE_ID = null; // We don't have the video yet.

export const getServerSideProps = withDefaultGetServerSidePropsRequirements<{
  user: UserType;
  owner: WorkspaceType;
  isAdmin: boolean;
  defaultExpertise: string;
  defaultAdminInterest: string;
  conversationId: string | null;
  gaTrackingId: string;
  baseUrl: string;
}>(async (context, session) => {
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user || !auth.isUser()) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  const isAdmin = auth.isAdmin();
  const expertise = await getUserMetadata(user, "expertise");
  const adminInterest = isAdmin
    ? await getUserMetadata(user, "interest")
    : null;

  // If user was in onboarding flow "domain_conversation_link"
  // We will redirect to the conversation page after onboarding.
  const conversationId =
    typeof context.query.cId === "string" ? context.query.cId : null;

  return {
    props: {
      user,
      owner,
      isAdmin,
      defaultExpertise: expertise?.value || "",
      defaultAdminInterest: adminInterest?.value || "",
      conversationId,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function Welcome({
  user,
  owner,
  isAdmin,
  defaultExpertise,
  defaultAdminInterest,
  conversationId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string>(user.firstName);
  const [lastName, setLastName] = useState<string>(user.lastName || "");
  const [expertise, setExpertise] = useState<string>(defaultExpertise);
  const [adminInterest, setAdminInterest] =
    useState<string>(defaultAdminInterest);
  const [isFormValid, setIsFormValid] = useState<boolean>(false);
  const [displayVideoScreen, setDisplayVideoScreen] = useState<boolean>(false);

  const youtubeId = isAdmin ? ADMIN_YOUTUBE_ID : MEMBER_YOUTUBE_ID;

  useEffect(() => {
    setIsFormValid(
      firstName !== "" &&
        lastName !== "" &&
        expertise !== "" &&
        (isAdmin ? adminInterest !== "" : true)
    );
  }, [firstName, lastName, expertise, adminInterest, isAdmin]);

  const { submit, isSubmitting } = useSubmitFunction(async () => {
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
      if (isAdmin) {
        await fetch("/api/user/metadata/interest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: adminInterest }),
        });
      }
    }
    // We don't block the user if it fails here.
    if (youtubeId) {
      setDisplayVideoScreen(true);
    } else {
      await redirectToApp();
    }
  });

  const redirectToApp = async () => {
    if (conversationId) {
      await router.push(`/w/${owner.sId}/assistant/${conversationId}`);
    } else {
      await router.push(`/w/${owner.sId}/assistant/new`);
    }
  };

  if (!displayVideoScreen) {
    return (
      <OnboardingLayout
        owner={owner}
        gaTrackingId={gaTrackingId}
        headerTitle="Joining Dust"
        headerRightActions={
          <Button
            label={youtubeId ? "Next" : "Ok"}
            disabled={!isFormValid || isSubmitting}
            size="sm"
            onClick={submit}
          />
        }
      >
        <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
          <Page.Header
            title={`Hello ${firstName}!`}
            icon={() => <LogoSquareColorLogo className="-ml-11 h-10 w-32" />}
          />
          <p className="font-semibold text-element-800">
            Let's check a few things.
          </p>
          {!isAdmin && (
            <div>
              <p className="text-element-700">
                You will be joining the workspace:{" "}
                <span className="font-semibold">{owner.name}</span>.
              </p>
            </div>
          )}
          <div>
            <p className="pb-2 text-element-700">Your name is:</p>
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
          {isAdmin && (
            <div>
              <p className="pb-2">I'm looking at Dust:</p>
              <RadioButton
                name="adminInterest"
                className="flex-col font-semibold sm:flex-row"
                choices={[
                  {
                    label: "Just for me",
                    value: "personnal",
                    disabled: false,
                  },
                  {
                    label: "For me and my team",
                    value: "team",
                    disabled: false,
                  },
                ]}
                value={adminInterest}
                onChange={setAdminInterest}
              />
            </div>
          )}
          <div>
            <p className="pb-2 text-element-700">
              How much do you know about AI assistants?
            </p>
            <RadioButton
              name="expertise"
              className="flex-col font-semibold sm:flex-row"
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
          <div className="flex justify-end">
            <Button
              label={youtubeId ? "Next" : "Ok"}
              disabled={!isFormValid || isSubmitting}
              size="md"
              onClick={submit}
            />
          </div>
        </div>
      </OnboardingLayout>
    );
  } else if (displayVideoScreen && youtubeId !== null) {
    return (
      <OnboardingLayout
        owner={owner}
        gaTrackingId={gaTrackingId}
        headerTitle="Joining Dust"
        headerRightActions={
          <Button
            label="Ok"
            disabled={!isFormValid}
            size="sm"
            onClick={redirectToApp}
          />
        }
      >
        <div className="flex h-full flex-col gap-6 pt-4 md:justify-center md:pt-0">
          <Page.Header
            title={`You're ready to go!`}
            icon={() => <Logo className="-ml-8 h-4 w-32" />}
          />
          <p className="text-element-800">
            Here is a short video to get you started with Dust.
          </p>
          <div>
            <YoutubeIframe youtubeId={youtubeId} />
          </div>
          <div className="flex justify-center">
            <Button
              label="Ok"
              disabled={!isFormValid}
              size="md"
              onClick={redirectToApp}
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
