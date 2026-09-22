import type { UserType } from "@app/types/user";

export class LightUserFactory {
  private static counter = 0;

  static build(overrides: Partial<UserType> = {}): UserType {
    const id = ++LightUserFactory.counter;
    return {
      sId: `user_${id}`,
      id,
      createdAt: 0,
      provider: "google",
      username: `user_${id}`,
      email: `user_${id}@example.com`,
      firstName: "Test",
      lastName: "User",
      fullName: "Test User",
      image: null,
      lastLoginAt: null,
      ...overrides,
    };
  }
}
