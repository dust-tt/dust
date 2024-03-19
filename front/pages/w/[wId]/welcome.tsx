import {
  Button,
  Input,
  LogoSquareColorLogo,
  Page,
  RadioButton,
  SparklesIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Confetti from "react-confetti";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { getUserMetadata } from "@app/lib/api/user";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  user: UserType;
  owner: WorkspaceType;
  isAdmin: boolean;
  defaultExpertise: string;
  defaultAdminInterest: string;
  conversationId: string | null;
  gaTrackingId: string;
  baseUrl: string;
}>(async (context, auth) => {
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
  const [showFinalScreen, setShowFinalScreen] = useState<boolean>(false);

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
    setShowFinalScreen(true);
  });

  const redirectToApp = async () => {
    if (conversationId) {
      await router.push(`/w/${owner.sId}/assistant/${conversationId}`);
    } else {
      await router.push(`/w/${owner.sId}/assistant/new`);
    }
  };

  if (!showFinalScreen) {
    return (
      <OnboardingLayout
        owner={owner}
        gaTrackingId={gaTrackingId}
        headerTitle="Joining Dust"
        headerRightActions={
          <Button
            label={"Next"}
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
              label={"Next"}
              disabled={!isFormValid || isSubmitting}
              size="md"
              onClick={submit}
            />
          </div>
        </div>
      </OnboardingLayout>
    );
  } else if (showFinalScreen) {
    return (
      <OnboardingLayout
        owner={owner}
        gaTrackingId={gaTrackingId}
        headerTitle="Joining Dust"
        headerRightActions={<></>}
      >
        <Confetti
          wind={0.02}
          gravity={0.08}
          numberOfPieces={100}
          colors={[
            "#FCD34D",
            "#6EE7B7",
            "#7DD3FC",
            "#F9A8D4",
            "#FCA5A5",
            "#D8B4FE",
          ]}
        />
        <div className="flex h-full flex-col gap-6 pt-4 md:justify-center md:pt-0">
          <Page.Header title={`You are all set!`} icon={SparklesIcon} />
          <Page.P>
            We're glad to have you onboard.
            <br />
            Thank you for your trust.
          </Page.P>
          <div className="flex w-full flex-col items-end">
            <Button label="Let's roll" size="md" onClick={redirectToApp} />
          </div>
        </div>
      </OnboardingLayout>
    );
  }
}
