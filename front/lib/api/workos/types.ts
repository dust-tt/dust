type OrganizationSelectionRequiredError = {
  code: "organization_selection_required";
  pending_authentication_token: string;
};

export function isOrganizationSelectionRequiredError(
  error: unknown
): error is OrganizationSelectionRequiredError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as any).code === "organization_selection_required" &&
    typeof (error as any).pending_authentication_token === "string"
  );
}
