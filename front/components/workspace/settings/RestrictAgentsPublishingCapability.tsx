import { ContextItem, LockIcon, SliderToggle } from "@dust-tt/sparkle";

export function RestrictAgentsPublishingCapability() {
  return (
    <ContextItem
      title="Restricted agents publication"
      subElement="Publishing agents is restricted to builders and admins"
      visual={<LockIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle selected={true} disabled={true} onClick={() => {}} />
      }
    />
  );
}
