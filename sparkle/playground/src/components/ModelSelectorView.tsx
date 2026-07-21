import {
  Button,
  Check,
  ChevronRight,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  MagicWand02,
  SliderToggle,
  Stars02,
  Tooltip,
  Users01,
} from "@dust-tt/sparkle";
import { DropdownMenuStaticItem } from "@dust-tt/sparkle/components/Dropdown";
import type { ComponentProps, ReactElement } from "react";
import { useMemo, useState } from "react";

import type { Effort } from "../data/models";
import {
  EFFORT_ORDER,
  EFFORTS,
  getAccessibleModels,
  getEffortOption,
  getGroupedModelsByProvider,
  getMaxEffortForModel,
  getMaxEffortForProfile,
  isModelAccessible,
  MODEL_PROVIDERS,
  MODELS,
  PROFILES,
} from "../data/models";

// Lower an effort down to a cap when it exceeds it.
function clampEffort(effort: Effort, cap: Effort | null): Effort {
  if (!cap) {
    return effort;
  }
  return EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(cap)
    ? cap
    : effort;
}

function isEffortWithinCap(effort: Effort, cap: Effort | null): boolean {
  return (
    cap !== null && EFFORT_ORDER.indexOf(effort) <= EFFORT_ORDER.indexOf(cap)
  );
}

const ACCESS_TOOLTIP = "Ask for higher model access";

// DropdownMenuRadioItem has no `tooltip` prop, so wrap disabled items in a
// Tooltip whose trigger (a span) still receives hover while the item itself is
// pointer-events-none.
function ModelRadioItem(
  props: ComponentProps<typeof DropdownMenuRadioItem>
): ReactElement {
  const item = <DropdownMenuRadioItem {...props} />;
  if (!props.disabled) {
    return item;
  }
  return (
    <Tooltip
      tooltipTriggerAsChild
      label={ACCESS_TOOLTIP}
      trigger={<span className="block w-full">{item}</span>}
    />
  );
}

function EffortDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function ModelSelectorView() {
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [isAuto, setIsAuto] = useState(true);
  const [effort, setEffort] = useState<Effort>("medium");
  const [selectedModelId, setSelectedModelId] = useState(
    getAccessibleModels(PROFILES[0])[0]?.id ?? MODELS[0].id
  );
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const profile = useMemo(
    () => PROFILES.find((p) => p.id === profileId) ?? PROFILES[0],
    [profileId]
  );

  const accessibleModels = useMemo(
    () => getAccessibleModels(profile),
    [profile]
  );

  const selectedModel = useMemo(
    () =>
      MODELS.find((m) => m.id === selectedModelId) ??
      accessibleModels[0] ??
      MODELS[0],
    [selectedModelId, accessibleModels]
  );

  const selectedProvider = useMemo(
    () => MODEL_PROVIDERS.find((p) => p.id === selectedModel.provider),
    [selectedModel]
  );

  // Effort cap depends on mode: Auto uses the profile-wide max, otherwise the
  // selected model's tier cap.
  const effortCap = isAuto
    ? getMaxEffortForProfile(profile)
    : getMaxEffortForModel(profile, selectedModel);

  const selectedEffort = getEffortOption(clampEffort(effort, effortCap));

  // Search across all models; inaccessible ones are shown disabled.
  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return MODELS.filter((m) => m.name.toLowerCase().includes(query));
  }, [search]);

  const triggerTooltip = `${isAuto ? "Auto" : selectedModel.name} · ${
    selectedEffort.label
  }`;
  const triggerIcon = isAuto
    ? Stars02
    : (selectedProvider?.icon ?? MagicWand02);

  const handleSelectProfile = (id: string) => {
    const nextProfile = PROFILES.find((p) => p.id === id) ?? PROFILES[0];
    const nextAccessible = getAccessibleModels(nextProfile);

    // Reset selection if the current model is no longer accessible.
    const nextModel = isModelAccessible(nextProfile, selectedModel)
      ? selectedModel
      : (nextAccessible[0] ?? selectedModel);
    setSelectedModelId(nextModel.id);

    // Clamp effort to the new cap for the resulting mode.
    const nextCap = isAuto
      ? getMaxEffortForProfile(nextProfile)
      : getMaxEffortForModel(nextProfile, nextModel);
    setEffort(clampEffort(effort, nextCap));

    setProfileId(id);
  };

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id);
    const model = MODELS.find((m) => m.id === id);
    if (model) {
      setEffort(clampEffort(effort, getMaxEffortForModel(profile, model)));
    }
    setSearch("");
    setOpen(false);
  };

  const handleToggleAuto = () => {
    setIsAuto((prev) => {
      const next = !prev;
      // When switching to a specific model, make sure it is accessible.
      const model = isModelAccessible(profile, selectedModel)
        ? selectedModel
        : (accessibleModels[0] ?? selectedModel);
      if (model.id !== selectedModelId) {
        setSelectedModelId(model.id);
      }
      const nextCap = next
        ? getMaxEffortForProfile(profile)
        : getMaxEffortForModel(profile, model);
      setEffort((e) => clampEffort(e, nextCap));
      return next;
    });
  };

  const handleSelectEffort = (value: Effort) => {
    if (isEffortWithinCap(value, effortCap)) {
      setEffort(value);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="heading-2xl text-foreground">Model Selector</h1>
        <p className="text-muted-foreground copy-sm">
          {isAuto
            ? `Auto · ${selectedEffort.label}`
            : `${selectedModel.name} · ${selectedEffort.label}`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-muted-foreground copy-xs uppercase tracking-wide">
          Test profile
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              isSelect
              icon={Users01}
              label={profile.name}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <DropdownMenuLabel label="User profile" />
            <DropdownMenuRadioGroup
              value={profileId}
              onValueChange={handleSelectProfile}
            >
              {PROFILES.map((p) => (
                <DropdownMenuRadioItem
                  key={p.id}
                  value={p.id}
                  label={p.name}
                  description={p.description}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            icon={triggerIcon}
            iconRight={<EffortDot color={selectedEffort.color} />}
            variant="outline"
            size="sm"
            isSelect
            tooltip={triggerTooltip}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel label="Model" />
          <DropdownMenuStaticItem label="Auto">
            <SliderToggle selected={isAuto} onClick={handleToggleAuto} />
          </DropdownMenuStaticItem>

          {!isAuto && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                label={selectedModel.name}
                icon={selectedProvider?.icon}
              />
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-72">
                  <DropdownMenuSearchbar
                    value={search}
                    onChange={setSearch}
                    name="model-search"
                    placeholder="Search models"
                  />
                  {search.trim() ? (
                    <DropdownMenuRadioGroup
                      value={selectedModelId}
                      onValueChange={handleSelectModel}
                    >
                      {filteredModels.length > 0 ? (
                        filteredModels.map((model) => {
                          const provider = MODEL_PROVIDERS.find(
                            (p) => p.id === model.provider
                          );
                          return (
                            <ModelRadioItem
                              key={model.id}
                              value={model.id}
                              label={model.name}
                              description={model.description}
                              icon={provider?.icon}
                              disabled={!isModelAccessible(profile, model)}
                            />
                          );
                        })
                      ) : (
                        <div className="text-muted-foreground copy-sm px-2 py-3 text-center">
                          No models found.
                        </div>
                      )}
                    </DropdownMenuRadioGroup>
                  ) : (
                    MODEL_PROVIDERS.map((provider) => (
                      <DropdownMenuSub key={provider.id}>
                        <DropdownMenuSubTrigger>
                          <div className="flex flex-grow items-center gap-2.5">
                            <Icon visual={provider.icon} size="sm" />
                            <span className="flex-grow">{provider.name}</span>
                            {selectedModel.provider === provider.id && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Icon visual={Check} size="xs" />
                                <span className="text-xs">
                                  {selectedModel.name}
                                </span>
                              </span>
                            )}
                            <Icon
                              visual={ChevronRight}
                              size="xs"
                              className="text-muted-foreground"
                            />
                          </div>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            {(() => {
                              const { recommended, legacy } =
                                getGroupedModelsByProvider(provider.id);
                              return (
                                <DropdownMenuRadioGroup
                                  value={selectedModelId}
                                  onValueChange={handleSelectModel}
                                >
                                  {recommended.length > 0 && (
                                    <DropdownMenuLabel label="Recommended" />
                                  )}
                                  {recommended.map((model) => (
                                    <ModelRadioItem
                                      key={model.id}
                                      value={model.id}
                                      label={model.name}
                                      description={model.description}
                                      disabled={
                                        !isModelAccessible(profile, model)
                                      }
                                    />
                                  ))}
                                  {legacy.length > 0 && (
                                    <DropdownMenuLabel label="Legacy" />
                                  )}
                                  {legacy.map((model) => (
                                    <ModelRadioItem
                                      key={model.id}
                                      value={model.id}
                                      label={model.name}
                                      description={model.description}
                                      disabled={
                                        !isModelAccessible(profile, model)
                                      }
                                    />
                                  ))}
                                </DropdownMenuRadioGroup>
                              );
                            })()}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuLabel label="Effort" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              label={selectedEffort.label}
              icon={<EffortDot color={selectedEffort.color} />}
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64">
                {EFFORTS.map((e) => {
                  const allowed = isEffortWithinCap(e.value, effortCap);
                  return (
                    <DropdownMenuItem
                      key={e.value}
                      label={e.label}
                      disabled={!allowed}
                      tooltip={allowed ? undefined : ACCESS_TOOLTIP}
                      icon={<EffortDot color={e.color} />}
                      endComponent={
                        <span className="text-muted-foreground copy-sm">
                          {e.description}
                        </span>
                      }
                      onClick={() => handleSelectEffort(e.value)}
                      onSelect={(event) => event.preventDefault()}
                    />
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
