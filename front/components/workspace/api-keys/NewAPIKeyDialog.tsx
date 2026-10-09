import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import type { KeyRole } from "@app/components/workspace/api-keys/utils";
import {
  dollarsToMicroUsd,
  isKeyRole,
  KEY_ROLES,
  parseCreditsString,
  getMonthlyCapCreditsSchema,
  getMonthlyCapDollarsSchema,
  parseDollarsString,
} from "@app/components/workspace/api-keys/utils";
import { compareStrings } from "@app/lib/i18n/format";
import type { GroupType } from "@app/types/groups";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { FormProvider, useController, useForm } from "react-hook-form";
import { z } from "zod";

function getFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    name: z.string().min(1, t(msg`API key name is required`)),
    monthlyCapDollars: getMonthlyCapDollarsSchema(t),
    monthlyCapCredits: getMonthlyCapCreditsSchema(t),
    selectedSpaceIds: z.array(z.string()),
    selectedAnalyticsGroupIds: z.array(z.string()),
    role: z.enum(KEY_ROLES),
  });
}

type FormValues = z.infer<ReturnType<typeof getFormSchema>>;

interface ScopePickerItem {
  sId: string;
  name: string;
}

// A searchable dropdown to add items, and the selected items as removable chips.
function ScopePicker({
  items,
  selectedIds,
  onChange,
  addLabel,
  searchName,
  searchPlaceholder,
  emptyLabel,
}: {
  items: ScopePickerItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  addLabel: string;
  searchName: string;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [search, setSearch] = useState("");

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.sId, item])),
    [items]
  );

  const matchingItems = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return [...items]
      .sort((a, b) =>
        compareStrings(a.name.toLowerCase(), b.name.toLowerCase())
      )
      .filter(
        (item) =>
          !selectedIdSet.has(item.sId) &&
          item.name.toLowerCase().includes(search.toLowerCase())
      );
  }, [items, search, selectedIds]);

  return (
    <>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" label={addLabel} size="sm" isSelect />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-72"
            align="start"
            dropdownHeaders={
              <DropdownMenuSearchbar
                name={searchName}
                placeholder={searchPlaceholder}
                value={search}
                onChange={setSearch}
              />
            }
          >
            {matchingItems.length === 0 && (
              <div className="flex items-center justify-center py-4 text-sm">
                {emptyLabel}
              </div>
            )}
            {matchingItems.map((item) => (
              <DropdownMenuItem
                key={item.sId}
                label={item.name}
                onSelect={(e) => e.preventDefault()}
                onClick={() => onChange([...selectedIds, item.sId])}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap gap-1">
        {selectedIds.map((id) => {
          const item = itemsById.get(id);
          if (!item) {
            return null;
          }
          return (
            <Button
              key={id}
              label={item.name}
              icon={XClose}
              size="xs"
              variant="ghost"
              onClick={() =>
                onChange(selectedIds.filter((selectedId) => selectedId !== id))
              }
            />
          );
        })}
      </div>
    </>
  );
}

interface NewAPIKeyDialogProps {
  spaces: SpaceType[];
  // Manual and provisioned groups whose analytics a user key can be given access to.
  analyticsGroups: GroupType[];
  disabled?: boolean;
  isGenerating: boolean;
  isRevoking: boolean;
  onCreate: (params: {
    name: string;
    spaceIds: string[];
    monthlyCapMicroUsd: number | null;
    monthlyCapAwuCredits: number | null;
    role: KeyRole;
    analyticsGroupIds: string[];
  }) => Promise<void>;
  showLegacyUsdMonthlyCap: boolean;
}

export const NewAPIKeyDialog = ({
  spaces,
  analyticsGroups,
  disabled,
  isGenerating,
  isRevoking,
  onCreate,
  showLegacyUsdMonthlyCap,
}: NewAPIKeyDialogProps) => {
  const { t } = useLingui();
  const formSchema = useMemo(() => getFormSchema(t), [t]);
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      monthlyCapDollars: "",
      monthlyCapCredits: "",
      selectedSpaceIds: [],
      selectedAnalyticsGroupIds: [],
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
    field: {
      value: selectedAnalyticsGroupIds,
      onChange: setSelectedAnalyticsGroupIds,
    },
  } = useController<FormValues, "selectedAnalyticsGroupIds">({
    name: "selectedAnalyticsGroupIds",
    control: form.control,
  });

  const {
    field: { value: roleValue, onChange: setRoleValue },
  } = useController<FormValues, "role">({
    name: "role",
    control: form.control,
  });

  const handleClose = () => {
    reset();
    setIsOpen(false);
  };

  const onSubmit = async (data: FormValues) => {
    const dollars = parseDollarsString(data.monthlyCapDollars);

    await onCreate({
      name: data.name,
      spaceIds: data.selectedSpaceIds,
      monthlyCapMicroUsd: dollarsToMicroUsd(dollars),
      monthlyCapAwuCredits: parseCreditsString(data.monthlyCapCredits),
      role: data.role,
      // Admin keys read every group's analytics: the server rejects a selection for them.
      analyticsGroupIds:
        data.role === "admin" ? [] : data.selectedAnalyticsGroupIds,
    });
    handleClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          label={t`Create API Key`}
          icon={Plus}
          disabled={disabled || isGenerating || isRevoking}
        />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <Trans>New API Key</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <FormProvider {...form}>
            <div className="space-y-4">
              <BaseFormFieldSection title={t`API Key Name`} fieldName="name">
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    {...registerProps}
                    onChange={onChange}
                    placeholder={t`Type an API key name`}
                    isError={!!errorMessage}
                    message={errorMessage}
                    messageStatus="error"
                  />
                )}
              </BaseFormFieldSection>

              <div className="flex flex-col gap-2">
                <Label>
                  <Trans>Spaces</Trans>
                </Label>
                <p className="text-sm text-muted-foreground">
                  <Trans>
                    The key can read everything workspace members can, including
                    open spaces and Company Data. Selecting a space grants the
                    key read and write access to it, such as uploading files.
                  </Trans>
                </p>
                <ScopePicker
                  items={spaces}
                  selectedIds={selectedSpaceIds}
                  onChange={setSelectedSpaceIds}
                  addLabel={t`Add Spaces`}
                  searchName="spaceSearch"
                  searchPlaceholder={t`Search spaces`}
                  emptyLabel={t`No spaces found`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>
                  <Trans>Access scope</Trans>
                </Label>
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
                    label={t`Can create conversations, read agents and data sources.`}
                  />
                  <RadioGroupItem
                    id="api-key-scope-admin"
                    value="admin"
                    className="gap-2"
                    label={t`Create and modify resources plus workspace administration (members, analytics export)`}
                  />
                </RadioGroup>
              </div>

              <div className="flex flex-col gap-2">
                <Label>
                  <Trans>Analytics</Trans>
                </Label>
                {roleValue === "admin" ? (
                  <p className="text-sm text-muted-foreground">
                    <Trans>This key can access all analytics.</Trans>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <Trans>
                        The key can read the analytics of the members of the
                        following groups.
                      </Trans>
                    </p>
                    <ScopePicker
                      items={analyticsGroups}
                      selectedIds={selectedAnalyticsGroupIds}
                      onChange={setSelectedAnalyticsGroupIds}
                      addLabel={t`Add Groups`}
                      searchName="analyticsGroupSearch"
                      searchPlaceholder={t`Search groups`}
                      emptyLabel={t`No groups found`}
                    />
                  </>
                )}
              </div>

              {showLegacyUsdMonthlyCap ? (
                <BaseFormFieldSection
                  title={t`Monthly cap (USD)`}
                  fieldName="monthlyCapDollars"
                >
                  {({ registerRef, registerProps, onChange, errorMessage }) => (
                    <Input
                      ref={registerRef}
                      {...registerProps}
                      onChange={onChange}
                      placeholder={t`Leave empty for unlimited`}
                      isError={!!errorMessage}
                      message={errorMessage}
                      messageStatus="error"
                    />
                  )}
                </BaseFormFieldSection>
              ) : (
                <BaseFormFieldSection
                  title={t`Monthly credit cap`}
                  fieldName="monthlyCapCredits"
                >
                  {({ registerRef, registerProps, onChange, errorMessage }) => (
                    <Input
                      ref={registerRef}
                      {...registerProps}
                      onChange={onChange}
                      placeholder={t`Leave empty for unlimited`}
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
            label: t`Cancel`,
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: t`Create`,
            variant: "primary",
            disabled: !formState.isValid,
            onClick: handleSubmit(onSubmit),
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
