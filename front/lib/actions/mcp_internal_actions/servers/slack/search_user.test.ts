import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Slack WebClient
const mockUsersInfo = vi.fn();
const mockUsersList = vi.fn();
const mockUsersLookupByEmail = vi.fn();
const mockUsergroupsList = vi.fn();

vi.mock("@slack/web-api", () => {
  return {
    WebClient: class MockWebClient {
      users = {
        info: mockUsersInfo,
        list: mockUsersList,
        lookupByEmail: mockUsersLookupByEmail,
      };
      usergroups = {
        list: mockUsergroupsList,
      };
    },
  };
});

// Mock Redis cache
vi.mock("@app/lib/cache/redis", () => ({
  cacheWithRedis: (fn: any) => fn,
}));

// Import after mocking
import {
  cleanUserPayload,
  executeListUserGroups,
  executeSearchUser,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/helpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeSearchUser - Slack Logic", () => {
  const testConfig = {
    accessToken: "xoxb-test-token",
    mcpServerId: "test-server-123",
  };

  describe("Direct user ID lookup", () => {
    it("should call users.info when query is a valid user ID", async () => {
      const mockUser = {
        id: "U01234ABCD",
        name: "john.doe",
        real_name: "John Doe",
        profile: { email: "john@company.com", display_name: "John" },
        is_bot: false,
        deleted: false,
      };

      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: mockUser,
      });

      const result = await executeSearchUser("U01234ABCD", false, testConfig);

      expect(mockUsersInfo).toHaveBeenCalledWith({ user: "U01234ABCD" });
      expect(mockUsersList).not.toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
    });

    it("should handle @ prefix in user ID", async () => {
      const mockUser = { id: "U01234ABCD", name: "john" };

      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: mockUser,
      });

      await executeSearchUser("@U01234ABCD", false, testConfig);

      expect(mockUsersInfo).toHaveBeenCalledWith({ user: "U01234ABCD" });
    });

    it("should return error if user ID not found", async () => {
      mockUsersInfo.mockResolvedValue({
        ok: false,
      });

      const result = await executeSearchUser("U99999ZZZZZ", false, testConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("User not found");
      }
    });
  });

  describe("Direct email lookup", () => {
    it("should call users.lookupByEmail when query is an email", async () => {
      const mockUser = {
        id: "U01234ABCD",
        name: "john.doe",
        profile: { email: "john@company.com" },
      };

      mockUsersLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockUser,
      });

      const result = await executeSearchUser(
        "john@company.com",
        false,
        testConfig
      );

      expect(mockUsersLookupByEmail).toHaveBeenCalledWith({
        email: "john@company.com",
      });
      expect(mockUsersList).not.toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
    });

    it("should return error if email not found", async () => {
      mockUsersLookupByEmail.mockResolvedValue({
        ok: false,
      });

      const result = await executeSearchUser(
        "notfound@company.com",
        false,
        testConfig
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not found for email");
      }
    });
  });

  describe("Text search without search_all", () => {
    it("should return error suggesting to use email/ID or search_all=true", async () => {
      const result = await executeSearchUser("john", false, testConfig);

      expect(mockUsersList).not.toHaveBeenCalled();
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain("Cannot search by name");
        expect(result.error.message).toContain("john");
        expect(result.error.message).toContain("user ID");
        expect(result.error.message).toContain("email address");
        expect(result.error.message).toContain("search_all=true");
      }
    });
  });

  describe("Text search with search_all=true", () => {
    it("should call users.list and filter results", async () => {
      const mockUsers = [
        {
          id: "U001",
          name: "john.doe",
          real_name: "John Doe",
          profile: { display_name: "John" },
          is_bot: false,
          deleted: false,
        },
        {
          id: "U002",
          name: "jane.smith",
          real_name: "Jane Smith",
          profile: { display_name: "Jane" },
          is_bot: false,
          deleted: false,
        },
        {
          id: "U003",
          name: "johnny.walker",
          real_name: "Johnny Walker",
          profile: { display_name: "Johnny" },
          is_bot: false,
          deleted: false,
        },
      ];

      mockUsersList.mockResolvedValue({
        ok: true,
        members: mockUsers,
        response_metadata: { next_cursor: "" },
      });

      const result = await executeSearchUser("john", true, testConfig);

      expect(mockUsersList).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 200, // SLACK_API_PAGE_SIZE
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const text = result.value[0].text;
        // Should match john.doe and johnny.walker, not jane.smith
        expect(text).toContain("Found 2 user(s)");
        expect(text).toContain("John Doe");
        expect(text).toContain("Johnny Walker");
        expect(text).not.toContain("Jane Smith");
      }
    });

    it("should handle pagination with cursor", async () => {
      // First page: 200 users
      const page1Users = Array.from({ length: 200 }, (_, i) => ({
        id: `U${String(i).padStart(3, "0")}`,
        name: `user${i}`,
        real_name: `User ${i}`,
        is_bot: false,
        deleted: false,
      }));

      // Second page: 50 users
      const page2Users = Array.from({ length: 50 }, (_, i) => ({
        id: `U${String(i + 200).padStart(3, "0")}`,
        name: `user${i + 200}`,
        real_name: `User ${i + 200}`,
        is_bot: false,
        deleted: false,
      }));

      mockUsersList
        .mockResolvedValueOnce({
          ok: true,
          members: page1Users,
          response_metadata: { next_cursor: "cursor-page-2" },
        })
        .mockResolvedValueOnce({
          ok: true,
          members: page2Users,
          response_metadata: { next_cursor: "" },
        });

      const result = await executeSearchUser("user", true, testConfig);

      // Should call users.list twice (pagination)
      expect(mockUsersList).toHaveBeenCalledTimes(2);
      expect(mockUsersList).toHaveBeenNthCalledWith(1, {
        cursor: undefined,
        limit: 200,
      });
      expect(mockUsersList).toHaveBeenNthCalledWith(2, {
        cursor: "cursor-page-2",
        limit: 200,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Should limit to MAX_USER_SEARCH_RESULTS (20)
        expect(result.value[0].text).toContain("Found 20 user(s)");
      }
    });

    it("should filter out bots", async () => {
      const mockUsers = [
        {
          id: "U001",
          name: "john",
          real_name: "John Doe",
          is_bot: false,
          deleted: false,
        },
        {
          id: "B002",
          name: "slackbot",
          real_name: "Slackbot",
          is_bot: true, // Should be filtered out
          deleted: false,
        },
      ];

      mockUsersList.mockResolvedValue({
        ok: true,
        members: mockUsers,
        response_metadata: { next_cursor: "" },
      });

      const result = await executeSearchUser("bot", true, testConfig);

      // Should not find any results because bot is filtered out
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("No users found");
      }
    });

    it("should filter out deleted users", async () => {
      const mockUsers = [
        {
          id: "U001",
          name: "active",
          real_name: "Active User",
          is_bot: false,
          deleted: false,
        },
        {
          id: "U002",
          name: "deleted",
          real_name: "Deleted User",
          is_bot: false,
          deleted: true, // Should be filtered out
        },
      ];

      mockUsersList.mockResolvedValue({
        ok: true,
        members: mockUsers,
        response_metadata: { next_cursor: "" },
      });

      const result = await executeSearchUser("deleted", true, testConfig);

      // Should not find any results because deleted user is filtered out
      expect(result.isErr()).toBe(true);
    });

    it("should prioritize exact matches over partial matches", async () => {
      const mockUsers = [
        {
          id: "U001",
          name: "john",
          real_name: "John Exact",
          is_bot: false,
          deleted: false,
        },
        {
          id: "U002",
          name: "john.smith",
          real_name: "John Smith StartsWith",
          is_bot: false,
          deleted: false,
        },
        {
          id: "U003",
          name: "superjohn",
          real_name: "Super John Contains",
          is_bot: false,
          deleted: false,
        },
      ];

      mockUsersList.mockResolvedValue({
        ok: true,
        members: mockUsers,
        response_metadata: { next_cursor: "" },
      });

      const result = await executeSearchUser("john", true, testConfig);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const text = result.value[0].text;
        // Exact match should appear first
        const exactIndex = text.indexOf("John Exact");
        const startsWithIndex = text.indexOf("John Smith StartsWith");
        const containsIndex = text.indexOf("Super John Contains");

        expect(exactIndex).toBeLessThan(startsWithIndex);
        expect(startsWithIndex).toBeLessThan(containsIndex);
      }
    });

    it("should return error if no users match", async () => {
      const mockUsers = [
        {
          id: "U001",
          name: "alice",
          real_name: "Alice",
          is_bot: false,
          deleted: false,
        },
      ];

      mockUsersList.mockResolvedValue({
        ok: true,
        members: mockUsers,
        response_metadata: { next_cursor: "" },
      });

      const result = await executeSearchUser("bob", true, testConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("No users found matching");
        expect(result.error.message).toContain("bob");
      }
    });
  });
});

describe("cleanUserPayload - Data Transformation", () => {
  it("should extract all essential user fields", () => {
    const mockUser = {
      id: "U01234ABCD",
      name: "john.doe",
      real_name: "John Doe",
      profile: {
        display_name: "Johnny",
        email: "john@company.com",
        first_name: "John",
        last_name: "Doe",
        title: "Software Engineer",
        phone: "+1234567890",
        status_text: "Working remotely",
        status_emoji: ":house:",
      },
      is_bot: false,
    };

    const result = cleanUserPayload(mockUser);

    expect(result).toEqual({
      id: "U01234ABCD",
      name: "john.doe",
      real_name: "John Doe",
      display_name: "Johnny",
      email: "john@company.com",
      first_name: "John",
      last_name: "Doe",
      title: "Software Engineer",
      phone: "+1234567890",
      status_text: "Working remotely",
      status_emoji: ":house:",
      is_bot: false,
    });
  });

  it("should handle missing optional fields with null/undefined", () => {
    const mockUser = {
      id: "U01234ABCD",
      name: "john.doe",
      real_name: "John Doe",
      profile: {},
      is_bot: false,
    };

    const result = cleanUserPayload(mockUser);

    expect(result.id).toBe("U01234ABCD");
    expect(result.name).toBe("john.doe");
    expect(result.real_name).toBe("John Doe");
    expect(result.display_name).toBe("");
    expect(result.first_name).toBeNull();
    expect(result.last_name).toBeNull();
    expect(result.email).toBeUndefined();
    expect(result.title).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.status_text).toBeUndefined();
    expect(result.status_emoji).toBeUndefined();
    expect(result.is_bot).toBe(false);
  });

  it("should use empty strings as fallback for required fields", () => {
    const mockUser = {
      profile: {},
    };

    const result = cleanUserPayload(mockUser);

    expect(result.id).toBe("");
    expect(result.name).toBe("");
    expect(result.real_name).toBe("");
    expect(result.display_name).toBe("");
  });

  it("should handle bot users correctly", () => {
    const mockUser = {
      id: "B01234ABCD",
      name: "slackbot",
      real_name: "Slackbot",
      profile: {},
      is_bot: true,
    };

    const result = cleanUserPayload(mockUser);

    expect(result.is_bot).toBe(true);
  });

  it("should work with Partial<Member> (from users.info/lookupByEmail)", () => {
    const mockUser = {
      id: "U01234ABCD",
      name: "jane.smith",
      real_name: "Jane Smith",
      profile: {
        email: "jane@company.com",
      },
    };

    const result = cleanUserPayload(mockUser);

    expect(result.id).toBe("U01234ABCD");
    expect(result.name).toBe("jane.smith");
    expect(result.real_name).toBe("Jane Smith");
    expect(result.email).toBe("jane@company.com");
    expect(result.is_bot).toBe(false); // Default to false
  });
});

describe("executeListUserGroups - User Groups", () => {
  it("should return all user groups with formatted markdown", async () => {
    const mockUserGroups = [
      {
        id: "S001",
        handle: "engineering",
        name: "Engineering Team",
        description: "All engineers",
        user_count: 25,
      },
      {
        id: "S002",
        handle: "marketing",
        name: "Marketing Team",
        description: "Marketing folks",
        user_count: 10,
      },
      {
        id: "S003",
        handle: "sales",
        name: "Sales Team",
        description: "Sales team",
        user_count: 15,
      },
    ];

    mockUsergroupsList.mockResolvedValue({
      ok: true,
      usergroups: mockUserGroups,
    });

    const result = await executeListUserGroups({
      accessToken: "xoxb-test-token",
    });

    expect(mockUsergroupsList).toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const text = result.value[0].text;
      expect(text).toContain("@engineering");
      expect(text).toContain("Engineering Team");
      expect(text).toContain("@marketing");
      expect(text).toContain("Marketing Team");
      expect(text).toContain("@sales");
      expect(text).toContain("Sales Team");
    }
  });

  it("should handle empty user groups list", async () => {
    mockUsergroupsList.mockResolvedValue({
      ok: true,
      usergroups: [],
    });

    const result = await executeListUserGroups({
      accessToken: "xoxb-test-token",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].text).toContain("The workspace has 0 user groups");
    }
  });

  it("should return error on API failure", async () => {
    mockUsergroupsList.mockResolvedValue({
      ok: false,
    });

    const result = await executeListUserGroups({
      accessToken: "xoxb-test-token",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Failed to list user groups");
    }
  });
});
