import type { ProjectMetadataType } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import {
  formatProjectMetadata,
  getMetadataFileInternalId,
  getProjectFolderInternalId,
} from "./format_metadata";

describe("formatProjectMetadata", () => {
  it("should format metadata with all fields populated", () => {
    const metadata: ProjectMetadataType = {
      createdAt: 0,
      sId: "",
      updatedAt: 0,
      spaceId: "space-123",
      description: "This is a test project",
      members: ["alice@example.com", "bob@example.com"],
    };

    const result = formatProjectMetadata(metadata);

    expect(result).toEqual(`# Description

This is a test project

# Members

- alice@example.com
- bob@example.com
`);
  });

  it("should handle metadata with only description", () => {
    const metadata: ProjectMetadataType = {
      createdAt: 0,
      sId: "",
      updatedAt: 0,
      spaceId: "space-123",
      description: "Only a description here",
      members: [],
    };

    const result = formatProjectMetadata(metadata);

    expect(result).toEqual(`# Description

Only a description here
`);
  });

  it("should handle metadata with only members", () => {
    const metadata: ProjectMetadataType = {
      createdAt: 0,
      sId: "",
      updatedAt: 0,
      spaceId: "space-123",
      description: null,
      members: ["alice@example.com"],
    };

    const result = formatProjectMetadata(metadata);

    expect(result).toEqual(`# Members

- alice@example.com
`);
  });
});

describe("getMetadataFileInternalId", () => {
  it("should generate correct internal ID for metadata file", () => {
    const result = getMetadataFileInternalId(123, "project-abc");

    expect(result).toBe("dust-project-123-project-project-abc-metadata");
  });

  it("should handle different connector IDs", () => {
    const result1 = getMetadataFileInternalId(1, "space-1");
    const result2 = getMetadataFileInternalId(999, "space-1");

    expect(result1).toBe("dust-project-1-project-space-1-metadata");
    expect(result2).toBe("dust-project-999-project-space-1-metadata");
    expect(result1).not.toBe(result2);
  });

  it("should handle different project IDs", () => {
    const result1 = getMetadataFileInternalId(123, "space-a");
    const result2 = getMetadataFileInternalId(123, "space-b");

    expect(result1).toBe("dust-project-123-project-space-a-metadata");
    expect(result2).toBe("dust-project-123-project-space-b-metadata");
    expect(result1).not.toBe(result2);
  });
});

describe("getProjectFolderInternalId", () => {
  it("should generate correct internal ID for project folder", () => {
    const result = getProjectFolderInternalId(123, "project-abc");

    expect(result).toBe("dust-project-123-project-project-abc");
  });

  it("should handle different connector IDs", () => {
    const result1 = getProjectFolderInternalId(1, "space-1");
    const result2 = getProjectFolderInternalId(999, "space-1");

    expect(result1).toBe("dust-project-1-project-space-1");
    expect(result2).toBe("dust-project-999-project-space-1");
    expect(result1).not.toBe(result2);
  });

  it("should handle different project IDs", () => {
    const result1 = getProjectFolderInternalId(123, "space-a");
    const result2 = getProjectFolderInternalId(123, "space-b");

    expect(result1).toBe("dust-project-123-project-space-a");
    expect(result2).toBe("dust-project-123-project-space-b");
    expect(result1).not.toBe(result2);
  });

  it("should generate different IDs than metadata file", () => {
    const folderID = getProjectFolderInternalId(123, "space-1");
    const metadataID = getMetadataFileInternalId(123, "space-1");

    expect(folderID).not.toBe(metadataID);
    expect(metadataID).toContain(folderID);
  });
});
