import { faker } from "@faker-js/faker";

import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";

export class UserFactory {
  private static defaultParams = (
    superUser: boolean = false,
    createdAt: Date = new Date()
  ) => {
    return {
      sId: generateRandomModelSId(),
      auth0Sub: faker.string.uuid(),
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
      lastLoginAt: new Date(),
    };
  };

  static async basic() {
    return UserResource.makeNew(this.defaultParams(false));
  }

  static async superUser() {
    return UserResource.makeNew(this.defaultParams(true));
  }

  static async withCreatedAt(createdAt: Date) {
    return UserResource.makeNew(this.defaultParams(false, createdAt));
  }
}
