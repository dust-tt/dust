import { getEgressPolicyDomainErrorMessage } from "@app/components/sandbox/egress_policy_domain_error";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { EgressPolicyDomainError } from "@app/types/sandbox/egress_policy";
import { describe, expect, it } from "vitest";

function render(error: EgressPolicyDomainError): string {
  return i18n._(getEgressPolicyDomainErrorMessage(error));
}

describe("getEgressPolicyDomainErrorMessage", () => {
  it("renders the validator's English message from the code", () => {
    for (const error of [
      new EgressPolicyDomainError("too_long"),
      new EgressPolicyDomainError("ip_address", "10.0.0.1"),
      new EgressPolicyDomainError("https_secret_single_label", "localhost"),
    ]) {
      expect(render(error)).toBe(error.message);
    }
  });

  it("translates the code in French", async () => {
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });

    expect(render(new EgressPolicyDomainError("too_long"))).toBe(
      "Le domaine ne doit pas dépasser 253 caractères."
    );
    expect(render(new EgressPolicyDomainError("ip_address", "10.0.0.1"))).toBe(
      "10.0.0.1 : Les adresses IP ne sont pas prises en charge."
    );
  });
});
