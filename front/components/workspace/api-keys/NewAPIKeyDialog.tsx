import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import type { KeyRole } from "@app/components/workspace/api-keys/utils";
import {
  dollarsToMicroUsd,
  isKeyRole,
  KEY_ROLES,
  monthlyCapCreditsSchema,
  monthlyCapDollarsSchema,
  parseCreditsString,
} from "@app/components/workspace/api-keys/utils";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { SpaceType } from "@app/types/space";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Input,
  Label,
  Plus,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo, useState } from "react";
import { FormProvider, useController, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(1, "API key name is required"),
  monthlyCapDollars: monthlyCapDollarsSchema,
  monthlyCapCredits: monthlyCapCreditsSchema,
  selectedSpaceIds: z.array(z.string()),
  role: z.enum(KEY_ROLES),
});

type FormValues = z.infer<typeof formSchema>;

interface NewAPIKeyDialogProps {
  spaces: SpaceType[];
  disabled?: boolean;
  isGenerating: boolean;
  isRevoking: boolean;
  onCreate: (params: {
    name: string;
    spaceIds: string[];
    monthlyCapMicroUsd: number | null;
    monthlyCapAwuCredits: number | null;
    role: KeyRole;
  }) => Promise<void>;
  showLegacyUsdMonthlyCap: boolean;
}

export const NewAPIKeyDialog = ({
  spaces,
  disabled,
  isGenerating,
  isRevoking,
  onCreate,
  showLegacyUsdMonthlyCap,
}: NewAPIKeyDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [spaceSearch, setSpaceSearch] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      monthlyCapDollars: "",
      monthlyCapCredits: "",
      selectedSpaceIds: [],
      role: "user",
    },
  });

  const { handleSubmit, reset, formState } = form;

  const {
    field: { value: selectedSpaceIds, onChange: setSelectedSpaceIds },
  } = useController<FormValues, "selectedSpaceIds">({
    name: "selectedSpaceIds",
    control: form.control,
  });

  const {
    field: { value: roleValue, onChange: setRoleValue },
  } = useController<FormValues, "role">({
    name: "role",
    control: form.control,
  });

  const removeSpaceId = (spaceId: string) => {
    setSelectedSpaceIds(selectedSpaceIds.filter((sId) => sId !== spaceId));
  };

  const spacesById = useMemo(() => {
    const map: Record<string, SpaceType> = {};
    for (const space of spaces) {
      map[space.sId] = space;
    }
    return map;
  }, [spaces]);

  const sortedSpaces = useMemo(
    () =>
      [...spaces].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      ),
    [spaces]
  );

  const matchingSpaces = useMemo(
    () =>
      sortedSpaces.filter((space) =>
        space.name.toLowerCase().includes(spaceSearch.toLowerCase())
      ),
    [sortedSpaces, spaceSearch]
  );

  const handleClose = () => {
    reset();
    setIsOpen(false);
  };

  const onSubmit = async (data: FormValues) => {
    const dollars =
      data.monthlyCapDollars === "" ? null : parseFloat(data.monthlyCapDollars);

    await onCreate({
      name: data.name,
      spaceIds: data.selectedSpaceIds,
      monthlyCapMicroUsd: dollarsToMicroUsd(dollars),
      monthlyCapAwuCredits: parseCreditsString(data.monthlyCapCredits),
      role: data.role,
    });
    handleClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          label="Create API Key"
          icon={Plus}
          disabled={disabled || isGenerating || isRevoking}
        />
      </SheetTrigger>
      <SheetContent size="lg">
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
                <Label>Spaces</Label>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        label="Add Spaces"
                        size="sm"
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-72"
                      align="start"
                      dropdownHeaders={
                        <DropdownMenuSearchbar
                          name="spaceSearch"
                          placeholder="Search spaces"
                          value={spaceSearch}
                          onChange={setSpaceSearch}
                        />
                      }
                    >
                      {matchingSpaces.length === 0 && (
                        <div className="flex items-center justify-center py-4 text-sm">
                          No spaces found
                        </div>
                      )}
                      {matchingSpaces
                        .filter(
                          (space) => !selectedSpaceIds.includes(space.sId)
                        )
                        .map((space) => (
                          <DropdownMenuItem
                            key={space.sId}
                            label={space.name}
                            onSelect={(e) => e.preventDefault()}
                            onClick={() =>
                              setSelectedSpaceIds([
                                ...selectedSpaceIds,
                                space.sId,
                              ])
                            }
                          />
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    label={GLOBAL_SPACE_NAME}
                    size="xs"
                    variant="outline"
                    disabled
                  />
                  {selectedSpaceIds.map((id) => {
                    const space = spacesById[id];
                    if (!space) {
                      return null;
                    }
                    return (
                      <Button
                        key={id}
                        label={space.name}
                        icon={XClose}
                        size="xs"
                        variant="ghost"
                        onClick={() => removeSpaceId(id)}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Access scope</Label>
                <RadioGroup
                  value={roleValue}
                  onValueChange={(value) => {
                    if (isKeyRole(value)) {
                      setRoleValue(value);
                    }
                  }}
                  className="flex flex-col gap-1"
                >
                  <RadioGroupItem
                    id="api-key-scope-user"
                    value="user"
                    className="gap-2"
                    label="Can create conversations, read agents and data sources."
                  />
                  <RadioGroupItem
                    id="api-key-scope-admin"
                    value="admin"
                    className="gap-2"
                    label="Create and modify resources plus workspace administration (members, analytics export)"
                  />
                </RadioGroup>
              </div>

              {showLegacyUsdMonthlyCap ? (
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
              ) : (
                <BaseFormFieldSection
                  title="Monthly credit cap"
                  fieldName="monthlyCapCredits"
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
              )}
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
