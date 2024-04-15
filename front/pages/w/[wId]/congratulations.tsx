import {
  Button,
  ConfettiBackground,
  Page,
  SparklesIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useRef } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import { getUserMetadata } from "@app/lib/api/user";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

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
      baseUrl: config.getAppUrl(),
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function Congratulations({
  owner,
  conversationId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const referentRef = useRef<HTMLDivElement>(null);
  const redirectToApp = async () => {
    if (conversationId) {
      await router.replace(`/w/${owner.sId}/assistant/${conversationId}`);
    } else {
      await router.replace(`/w/${owner.sId}/assistant/new`);
    }
  };
  return (
    <div className="h-full" ref={referentRef}>
      <OnboardingLayout
        owner={owner}
        gaTrackingId={gaTrackingId}
        headerTitle="Joining Dust"
        headerRightActions={<></>}
      >
        <ConfettiBackground variant="confetti" referentSize={referentRef} />
        <div className="z-10 flex h-full flex-col gap-6 pt-4 md:justify-center md:pt-0">
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
    </div>
  );
}
