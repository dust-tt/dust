import {
  Button,
  DustLogoSquare,
  Input,
  Page,
  RadioGroup,
  RadioGroupItem,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { UserType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  user: UserType;
  owner: WorkspaceType;
  isAdmin: boolean;
  defaultExpertise: string;
  defaultAdminInterest: string;
  conversationId: string | null;
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

  const expertise = await user.getMetadata("expertise");
  const adminInterest = isAdmin ? await user.getMetadata("interest") : null;

  // If user was in onboarding flow "domain_conversation_link"
  // We will redirect to the conversation page after onboarding.
  const conversationId =
    typeof context.query.cId === "string" ? context.query.cId : null;

  return {
    props: {
      user: user.toJSON(),
      owner,
      isAdmin,
      defaultExpertise: expertise?.value || "",
      defaultAdminInterest: adminInterest?.value || "",
      conversationId,
      baseUrl: config.getClientFacingUrl(),
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
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string>(user.firstName);
  const [lastName, setLastName] = useState<string>(user.lastName || "");
  const [expertise, setExpertise] = useState<string>(defaultExpertise);
  const [adminInterest, setAdminInterest] =
    useState<string>(defaultAdminInterest);
  const [isFormValid, setIsFormValid] = useState<boolean>(false);

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
    await router.push(
      `/w/${owner.sId}/congratulations?${
        conversationId ? `cId=${conversationId}` : ""
      }`
    );
  });

  return (
    <OnboardingLayout
      owner={owner}
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
          icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
        />
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          Let's check a few things.
        </p>
        {!isAdmin && (
          <div>
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              You will be joining the workspace:{" "}
              <span className="">{owner.name}</span>.
            </p>
          </div>
        )}
        <div>
          <p className="pb-2 text-muted-foreground dark:text-muted-foreground-night">
            Your name is:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              name="firstName"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              name="lastName"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        {isAdmin && (
          <div>
            <p className="pb-2">I'm looking at Dust:</p>
            <RadioGroup
              value={adminInterest}
              onValueChange={setAdminInterest}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <RadioGroupItem
                value="personnal"
                id="personal"
                label="Just for me"
              />
              <RadioGroupItem
                value="team"
                id="team"
                label="For me and my team"
              />
            </RadioGroup>
          </div>
        )}
        <div>
          <p className="pb-2 text-muted-foreground dark:text-muted-foreground-night">
            How much do you know about AI agent?
          </p>
          <RadioGroup
            value={expertise}
            id={expertise}
            onValueChange={setExpertise}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <RadioGroupItem value="beginner" id="beginner" label="Nothing!" />
            <RadioGroupItem
              value="intermediate"
              id="intermediate"
              label="I know the basics"
            />
            <RadioGroupItem value="advanced" id="advanced" label="I'm a pro" />
          </RadioGroup>
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
}
