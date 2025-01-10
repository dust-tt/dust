import { useHubspotForm } from "@aaronhayes/react-use-hubspot-form";
import { classNames } from "@dust-tt/sparkle";

export default function HubspotFormComponent() {
  const { loaded, error } = useHubspotForm({
    portalId: "144442587",
    formId: "31e790e5-f4d5-4c79-acc5-acd770fe8f84",
    target: "#hubspotForm",
  });

  if (error) {
    return <div className="text-red-500">Failed to load form</div>;
  }

  return (
    <>
      {!loaded && (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      )}
      <div
        id="hubspotForm"
        className={classNames("min-h-96", !loaded ? "hidden" : "")}
      />
    </>
  );
}

export function HubSpotForm() {
  return <HubspotFormComponent />;
}
