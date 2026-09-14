import { FileResource } from "@app/lib/resources/file_resource";
import { FileViewerResource } from "@app/lib/resources/file_viewer_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ForeignKeyConstraintError, QueryTypes } from "sequelize";
import { describe, expect, it } from "vitest";

describe("FileViewerResource", () => {
  it("preserves daily first/last bounds and counts UTC days for each verified email", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    const record = (verifiedEmail: string, at: string) =>
      FileViewerResource.recordView(file, {
        verifiedEmail,
        viewedAt: new Date(at),
      });
    const results = await Promise.all([
      record("alice@david.co", "2026-09-10T23:59:59Z"),
      record(" ALICE@DAVID.CO ", "2026-09-10T08:00:00Z"),
      record("alice@david.co", "2026-09-10T23:59:59Z"),
    ]);
    expect(results.every((result) => result.isOk())).toBe(true);
    expect(
      (await record("alice@david.co", "2026-09-11T02:00:01+02:00")).isOk()
    ).toBe(true);
    expect((await record("bob@david.co", "2026-09-11T10:00:00Z")).isOk()).toBe(
      true
    );
    const viewers = (await FileViewerResource.listForFile(file)).map((viewer) =>
      viewer.toJSON()
    );
    expect(viewers).toEqual([
      {
        email: "bob@david.co",
        firstViewedAt: Date.parse("2026-09-11T10:00:00Z"),
        lastViewedAt: Date.parse("2026-09-11T10:00:00Z"),
        viewedDays: 1,
      },
      {
        email: "alice@david.co",
        firstViewedAt: Date.parse("2026-09-10T08:00:00Z"),
        lastViewedAt: Date.parse("2026-09-11T00:00:01Z"),
        viewedDays: 2,
      },
    ]);
  });

  it("updates concurrent repeat views without advancing the daily row sequence", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    const record = (at: string) =>
      FileViewerResource.recordView(file, {
        verifiedEmail: "alice@david.co",
        viewedAt: new Date(at),
      });
    const readSequence = async () => {
      // biome-ignore lint/plugin/noRawSql: The Resource does not expose PostgreSQL sequence state.
      const [sequence] = await frontSequelize.query<{ lastValue: string }>(
        'SELECT last_value::text AS "lastValue" FROM file_viewer_dailies_id_seq',
        { type: QueryTypes.SELECT }
      );
      return sequence.lastValue;
    };

    expect((await record("2026-09-10T12:00:00Z")).isOk()).toBe(true);
    const sequenceBefore = await readSequence();
    const results = await Promise.all([
      record("2026-09-10T08:00:00Z"),
      record("2026-09-10T23:59:59Z"),
      record("2026-09-10T12:00:00Z"),
    ]);

    expect(results.every((result) => result.isOk())).toBe(true);
    expect(await readSequence()).toBe(sequenceBefore);
    expect(
      (await FileViewerResource.listForFile(file)).map((viewer) =>
        viewer.toJSON()
      )
    ).toEqual([
      {
        email: "alice@david.co",
        firstViewedAt: Date.parse("2026-09-10T08:00:00Z"),
        lastViewedAt: Date.parse("2026-09-10T23:59:59Z"),
        viewedDays: 1,
      },
    ]);
  });

  it("isolates viewer history and cleans it up with files and workspaces", async () => {
    const first = await createResourceTest({ role: "admin" });
    const second = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(first.authenticator, first.user, {
      useCase: "conversation",
      status: "created",
    });
    const otherFile = await FileFactory.csv(first.authenticator, first.user, {
      useCase: "conversation",
      status: "created",
    });
    const otherWorkspaceFile = await FileFactory.csv(
      second.authenticator,
      second.user,
      { useCase: "conversation", status: "created" }
    );
    expect(
      (
        await FileViewerResource.recordView(file, {
          verifiedEmail: "alice@david.co",
          viewedAt: new Date(),
        })
      ).isOk()
    ).toBe(true);
    expect(await FileViewerResource.listForFile(otherFile)).toEqual([]);
    expect(await FileViewerResource.listForFile(otherWorkspaceFile)).toEqual(
      []
    );
    expect(
      (
        await FileViewerResource.recordView(otherFile, {
          verifiedEmail: "bob@david.co",
          viewedAt: new Date(),
        })
      ).isOk()
    ).toBe(true);
    expect(
      (
        await FileViewerResource.recordView(otherWorkspaceFile, {
          verifiedEmail: "charlie@david.co",
          viewedAt: new Date(),
        })
      ).isOk()
    ).toBe(true);
    expect((await file.delete(first.authenticator)).isOk()).toBe(true);
    expect(await FileViewerResource.listForFile(file)).toEqual([]);
    expect(await FileViewerResource.listForFile(otherFile)).toHaveLength(1);
    expect(
      await FileViewerResource.listForFile(otherWorkspaceFile)
    ).toHaveLength(1);

    expect(await FileResource.deleteAllForWorkspace(first.authenticator)).toBe(
      1
    );
    expect(await FileViewerResource.listForFile(otherFile)).toEqual([]);
    expect(
      (await FileViewerResource.listForFile(otherWorkspaceFile)).map(
        (viewer) => viewer.toJSON().email
      )
    ).toEqual(["charlie@david.co"]);
    expect(
      await FileResource.fetchById(second.authenticator, otherWorkspaceFile.sId)
    ).not.toBeNull();
  });

  it("requires explicit viewer cleanup before deleting a file", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    expect(
      (
        await FileViewerResource.recordView(file, {
          verifiedEmail: "alice@david.co",
          viewedAt: new Date(),
        })
      ).isOk()
    ).toBe(true);
    // Direct model deletion verifies the FK guard independently of Resource cleanup.
    await withTransaction(async (transaction) => {
      await expect(
        frontSequelize.transaction({ transaction }, async (savepoint) => {
          await FileModel.destroy({
            where: { workspaceId: file.workspaceId, id: file.id },
            transaction: savepoint,
          });
        })
      ).rejects.toThrow(ForeignKeyConstraintError);
    });
    expect(await FileViewerResource.listForFile(file)).toHaveLength(1);
    expect((await file.delete(authenticator)).isOk()).toBe(true);
    expect(await FileViewerResource.listForFile(file)).toEqual([]);
  });

  it("returns database recording failures as a result", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    expect((await file.delete(authenticator)).isOk()).toBe(true);
    const result = await FileViewerResource.recordView(file, {
      verifiedEmail: "alice@david.co",
      viewedAt: new Date(),
    });
    expect(result.isErr()).toBe(true);
  });
});
