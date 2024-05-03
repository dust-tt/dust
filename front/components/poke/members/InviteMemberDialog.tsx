import { Spinner } from "@dust-tt/sparkle";
import type {
  InviteMemberFormType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  InviteMemberFormSchema,
  MEMBERSHIP_ROLE_TYPES,
  removeNulls,
} from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeDialog,
  PokeDialogContent,
  PokeDialogDescription,
  PokeDialogFooter,
  PokeDialogHeader,
  PokeDialogTitle,
  PokeDialogTrigger,
} from "@app/components/poke/shadcn/ui/dialog";
import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
export default function InviteMemberDialog({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const router = useRouter();

  const form = useForm<InviteMemberFormType>({
    resolver: ioTsResolver(InviteMemberFormSchema),
    defaultValues: {
      email: "",
      role: "user",
    },
  });

  const onSubmit = (values: InviteMemberFormType) => {
    const cleanedValues = Object.fromEntries(
      removeNulls(
        Object.entries(values).map(([key, value]) => {
          if (typeof value !== "string") {
            return [key, value];
          }
          const cleanedValue = value.trim();
          if (!cleanedValue) {
            return null;
          }
          return [key, cleanedValue];
        })
      )
    );

    const submit = async () => {
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/poke/workspaces/${owner.sId}/invitations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cleanedValues),
          }
        );

        if (!res.ok) {
          throw new Error(
            `Something went wrong: ${res.status} ${await res.text()}`
          );
        }

        form.reset();
        setOpen(false);
        router.reload();
      } catch (e) {
        setIsSubmitting(false);
        if (e instanceof Error) {
          setError(e.message);
        }
      }
    };
    void submit();
  };

  return (
    <PokeDialog open={open} onOpenChange={setOpen}>
      <PokeDialogTrigger asChild>
        <PokeButton variant="outline">🙋‍♂️ Invite a user</PokeButton>
      </PokeDialogTrigger>
      <PokeDialogContent className="bg-structure-50 sm:max-w-[600px]">
        <PokeDialogHeader>
          <PokeDialogTitle>
            Invite a user to {owner.name}'s workspace.
          </PokeDialogTitle>
          <PokeDialogDescription>
            Enter the user's email to grant them direct access to {owner.name}'s
            Workspace. Once invited, they'll receive an email notification.
            Please ensure the email address is accurate and that the user is
            aware they are being invited. They will get an email from{" "}
            <span className="font-bold">{user.fullName}</span>.
            <br />
            Note: the role 'user' below is the same as a 'member' role in the
            UI.
          </PokeDialogDescription>
        </PokeDialogHeader>
        {error && <div className="text-red-500">{error}</div>}
        {isSubmitting && <Spinner />}
        {!isSubmitting && (
          <PokeForm {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid gap-4 py-4">
                <div className="grid-cols grid items-center gap-4">
                  <InputField
                    control={form.control}
                    name="email"
                    title="User email"
                    placeholder="octave@abc.yz"
                  />
                </div>
                <div className="grid-cols grid items-center gap-4">
                  <SelectField
                    control={form.control}
                    name="role"
                    title="Role"
                    options={MEMBERSHIP_ROLE_TYPES.map((role) => ({
                      value: role,
                    }))}
                  />
                </div>
              </div>
              <PokeDialogFooter>
                <PokeButton
                  type="submit"
                  className="border-warning-600 bg-warning-500 text-white"
                >
                  Invite
                </PokeButton>
              </PokeDialogFooter>
            </form>
          </PokeForm>
        )}
      </PokeDialogContent>
    </PokeDialog>
  );
}
