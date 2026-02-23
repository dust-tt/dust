import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { faker } from "@faker-js/faker";

export class UserFactory {
  static async basic() {
    return UserResource.makeNew(this.defaultParams(false));
  }

  static async superUser() {
    return UserResource.makeNew(this.defaultParams(true));
  }

  static async withCreatedAt(createdAt: Date) {
    return UserResource.makeNew(this.defaultParams(false, createdAt));
  }

  static async withoutLastLogin() {
    return UserResource.makeNew(this.defaultParams(false, new Date(), null));
  }

  private static defaultParams = (
    superUser: boolean = false,
    createdAt: Date = new Date(),
    lastLoginAt: Date | null = new Date()
  ) => {
    return {
      sId: generateRandomModelSId(),
      workOSUserId: faker.string.uuid(),
      provider: "google" as const,
      providerId: faker.string.uuid(),

      username: faker.internet.displayName(),
      email: faker.internet.email({
        provider: superUser ? "dust.tt" : undefined,
      }),
      name: faker.person.fullName(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),

      isDustSuperUser: superUser,
      createdAt,
      lastLoginAt,
    };
  };
}
