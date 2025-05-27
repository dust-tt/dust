import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DustLogoSquare,
  Input,
  Page,
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
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string>(user.firstName);
  const [lastName, setLastName] = useState<string>(user.lastName || "");
  const [team, setTeam] = useState<string>("");
  const [isFormValid, setIsFormValid] = useState<boolean>(false);

  const teams = [
    { value: "customer_success", label: "Customer Success" },
    { value: "customer_support", label: "Customer Support" },
    { value: "data", label: "Data" },
    { value: "design", label: "Design" },
    { value: "engineering", label: "Engineering" },
    { value: "finance", label: "Finance" },
    { value: "people", label: "People (HR)" },
    { value: "legal", label: "Legal" },
    { value: "marketing", label: "Marketing" },
    { value: "operations", label: "Operations" },
    { value: "product", label: "Product" },
    { value: "sales", label: "Sales" },
    { value: "other", label: "Other" },
  ];

  useEffect(() => {
    setIsFormValid(
      firstName !== "" && lastName !== "" && teams.some((t) => t.value === team)
    );
  }, [firstName, lastName, team]);

  const { submit, isSubmitting } = useSubmitFunction(async () => {
    const updateUserFullNameRes = await fetch("/api/user", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ firstName, lastName }),
    });
    if (updateUserFullNameRes.ok) {
      await fetch("/api/user/metadata/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: team }),
      });
    }
    await router.push(
      `/w/${owner.sId}/assistant/new?welcome=true${
        conversationId ? `&cId=${conversationId}` : ""
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
              You'll be joining the workspace:{" "}
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
        <div>
          <p className="pb-2 text-muted-foreground">
            Pick your team to get relevant feature updates:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-between text-muted-foreground"
                  label={
                    teams.find((t) => t.value === team)?.label || "Select team"
                  }
                  isSelect={true}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuRadioGroup value={team} onValueChange={setTeam}>
                  {teams.map((teamOption) => (
                    <DropdownMenuRadioItem
                      key={teamOption.value}
                      value={teamOption.value}
                      label={teamOption.label}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
