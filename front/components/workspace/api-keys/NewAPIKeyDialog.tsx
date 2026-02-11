import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  dollarsToMicroUsd,
  monthlyCapDollarsSchema,
  prettifyGroupName,
} from "@app/components/workspace/api-keys/utils";
import type { GroupType } from "@app/types/groups";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";

const formSchema = z.object({
  name: z.string().min(1, "API key name is required"),
  monthlyCapDollars: monthlyCapDollarsSchema,
});

type FormValues = z.infer<typeof formSchema>;

interface NewAPIKeyDialogProps {
  groups: GroupType[];
  isGenerating: boolean;
  isRevoking: boolean;
  onCreate: (params: {
    name: string;
    group: GroupType | null;
    monthlyCapMicroUsd: number | null;
  }) => Promise<void>;
}

export const NewAPIKeyDialog = ({
  groups,
  isGenerating,
  isRevoking,
  onCreate,
}: NewAPIKeyDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [restrictedGroup, setRestrictedGroup] = useState<GroupType | null>(
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      monthlyCapDollars: "",
    },
  });

  const { handleSubmit, reset, formState } = form;

  const nonGlobalGroups = useMemo(
    () => groups.filter((g) => g.kind !== "global"),
    [groups]
  );

  const handleClose = () => {
    reset();
    setRestrictedGroup(null);
    setIsOpen(false);
  };

  const onSubmit = async (data: FormValues) => {
    const dollars =
      data.monthlyCapDollars === "" ? null : parseFloat(data.monthlyCapDollars);

    await onCreate({
      name: data.name,
      group: restrictedGroup,
      monthlyCapMicroUsd: dollarsToMicroUsd(dollars),
    });
    handleClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          label="Create API Key"
          icon={PlusIcon}
          disabled={isGenerating || isRevoking}
        />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New API Key</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <FormProvider {...form}>
            <div className="space-y-4">
              <BaseFormFieldSection title="API Key Name" fieldName="name">
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    {...registerProps}
                    onChange={onChange}
                    placeholder="Type an API key name"
                    isError={!!errorMessage}
                    message={errorMessage}
                    messageStatus="error"
                  />
                )}
              </BaseFormFieldSection>

              <div className="flex flex-col gap-2">
                <Label>Default Space</Label>
                <div>
                  <Button
                    label={GLOBAL_SPACE_NAME}
                    size="sm"
                    variant="outline"
                    disabled={true}
                    tooltip={`${GLOBAL_SPACE_NAME} is mandatory.`}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Add optional additional Space</Label>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label={
                          restrictedGroup
                            ? prettifyGroupName(restrictedGroup)
                            : "Add a space"
                        }
                        size="sm"
                        variant="outline"
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {nonGlobalGroups
                        .sort((a, b) =>
                          prettifyGroupName(a)
                            .toLowerCase()
                            .localeCompare(prettifyGroupName(b).toLowerCase())
                        )
                        .map((group: GroupType) => (
                          <DropdownMenuItem
                            key={group.id}
                            label={prettifyGroupName(group)}
                            onClick={() => setRestrictedGroup(group)}
                          />
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <BaseFormFieldSection
                title="Monthly cap (USD)"
                fieldName="monthlyCapDollars"
              >
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    {...registerProps}
                    onChange={onChange}
                    placeholder="Leave empty for unlimited"
                    isError={!!errorMessage}
                    message={errorMessage}
                    messageStatus="error"
                  />
                )}
              </BaseFormFieldSection>
            </div>
          </FormProvider>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Create",
            variant: "primary",
            disabled: !formState.isValid,
            onClick: handleSubmit(onSubmit),
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
