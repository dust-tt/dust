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
} from "@dust-tt/sparkle";
import { DropdownMenuStaticItem } from "@dust-tt/sparkle/components/Dropdown";
import { useMemo, useState } from "react";

import {
  getGroupedModelsByProvider,
  MODEL_PROVIDERS,
  MODELS,
} from "../data/models";

type Effort = "light" | "medium" | "high";

interface EffortOption {
  value: Effort;
  label: string;
  description: string;
  color: string;
}

const EFFORTS: EffortOption[] = [
  {
    value: "light",
    label: "Quick",
    description: "Simple tasks",
    color: "#7AC0F0",
  },
  {
    value: "medium",
    label: "Standard",
    description: "Everyday tasks",
    color: "#C6E36B",
  },
  {
    value: "high",
    label: "Deep",
    description: "Heavy tasks",
    color: "#F5A9C8",
  },
];

function EffortDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function ModelSelectorView() {
  const [isAuto, setIsAuto] = useState(true);
  const [effort, setEffort] = useState<Effort>("medium");
  const [selectedModelId, setSelectedModelId] = useState(MODELS[0].id);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selectedModel = useMemo(
    () => MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0],
    [selectedModelId]
  );

  const selectedProvider = useMemo(
    () => MODEL_PROVIDERS.find((p) => p.id === selectedModel.provider),
    [selectedModel]
  );

  const selectedEffort = useMemo(
    () => EFFORTS.find((e) => e.value === effort) ?? EFFORTS[1],
    [effort]
  );

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

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id);
    setSearch("");
    setOpen(false);
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
            <SliderToggle
              selected={isAuto}
              onClick={() => setIsAuto((v) => !v)}
            />
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
                            <DropdownMenuRadioItem
                              key={model.id}
                              value={model.id}
                              label={model.name}
                              description={model.description}
                              icon={provider?.icon}
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
                                    <DropdownMenuRadioItem
                                      key={model.id}
                                      value={model.id}
                                      label={model.name}
                                      description={model.description}
                                    />
                                  ))}
                                  {legacy.length > 0 && (
                                    <DropdownMenuLabel label="Legacy" />
                                  )}
                                  {legacy.map((model) => (
                                    <DropdownMenuRadioItem
                                      key={model.id}
                                      value={model.id}
                                      label={model.name}
                                      description={model.description}
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
                {EFFORTS.map((e) => (
                  <DropdownMenuItem
                    key={e.value}
                    label={e.label}
                    icon={<EffortDot color={e.color} />}
                    endComponent={
                      <span className="text-muted-foreground copy-sm">
                        {e.description}
                      </span>
                    }
                    onClick={() => setEffort(e.value)}
                    onSelect={(event) => event.preventDefault()}
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
