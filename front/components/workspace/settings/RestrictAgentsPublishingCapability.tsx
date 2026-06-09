import { ContextItem, Lock01, SliderToggle } from "@dust-tt/sparkle";

export function RestrictAgentsPublishingCapability({
  subElement,
}: {
  subElement: string;
}) {
  return (
    <ContextItem
      title="Restricted agents publication"
      subElement={subElement}
      visual={<Lock01 className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle selected={true} disabled={true} onClick={() => {}} />
      }
    />
  );
}
