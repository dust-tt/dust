import { vi } from "vitest";

// Mock the findWorkOSOrganizationsForUserId function to prevent real WorkOS API calls
const mockWorkOSOrganizationMembership = () => {
  vi.mock(
    "@app/lib/api/workos/organization_membership",
    async (importOriginal) => {
      const mod = (await importOriginal()) as Record<string, any>;
      return {
        ...mod,
        findWorkOSOrganizationsForUserId: vi.fn().mockResolvedValue([]),
      };
    }
  );
};

// Setup all WorkOS mocks
export const setupWorkOSMocks = () => {
  mockWorkOSOrganizationMembership();
};
