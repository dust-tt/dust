import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ForeignKeyConstraintError, QueryTypes } from "sequelize";
import { describe, expect, it } from "vitest";

describe("FileResource viewer history", () => {
  it("preserves daily first/last bounds and counts UTC days for each verified email", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    const record = (verifiedEmail: string, at: string) =>
      file.recordView({
        verifiedEmail,
        viewedAt: new Date(at),
      });
    await Promise.all([
      record("alice@david.co", "2026-09-10T23:59:59Z"),
      record(" ALICE@DAVID.CO ", "2026-09-10T08:00:00Z"),
      record("alice@david.co", "2026-09-10T23:59:59Z"),
    ]);
    await record("alice@david.co", "2026-09-11T02:00:01+02:00");
    await record("bob@david.co", "2026-09-11T10:00:00Z");
    const viewers = await file.getViewerSummaries();
    expect(viewers).toEqual([
      {
        email: "bob@david.co",
        firstViewedAt: new Date("2026-09-11T10:00:00Z"),
        lastViewedAt: new Date("2026-09-11T10:00:00Z"),
        viewedDays: 1,
      },
      {
        email: "alice@david.co",
        firstViewedAt: new Date("2026-09-10T08:00:00Z"),
        lastViewedAt: new Date("2026-09-11T00:00:01Z"),
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
      file.recordView({
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

    await record("2026-09-10T12:00:00Z");
    const sequenceBefore = await readSequence();
    await Promise.all([
      record("2026-09-10T08:00:00Z"),
      record("2026-09-10T23:59:59Z"),
      record("2026-09-10T12:00:00Z"),
    ]);

    expect(await readSequence()).toBe(sequenceBefore);
    expect(await file.getViewerSummaries()).toEqual([
      {
        email: "alice@david.co",
        firstViewedAt: new Date("2026-09-10T08:00:00Z"),
        lastViewedAt: new Date("2026-09-10T23:59:59Z"),
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
    await file.recordView({
      verifiedEmail: "alice@david.co",
      viewedAt: new Date(),
    });
    expect(await otherFile.getViewerSummaries()).toEqual([]);
    expect(await otherWorkspaceFile.getViewerSummaries()).toEqual([]);
    await otherFile.recordView({
      verifiedEmail: "bob@david.co",
      viewedAt: new Date(),
    });
    await otherWorkspaceFile.recordView({
      verifiedEmail: "charlie@david.co",
      viewedAt: new Date(),
    });
    expect((await file.delete(first.authenticator)).isOk()).toBe(true);
    expect(await file.getViewerSummaries()).toEqual([]);
    expect(await otherFile.getViewerSummaries()).toHaveLength(1);
    expect(await otherWorkspaceFile.getViewerSummaries()).toHaveLength(1);

    expect(await FileResource.deleteAllForWorkspace(first.authenticator)).toBe(
      1
    );
    expect(await otherFile.getViewerSummaries()).toEqual([]);
    expect(
      (await otherWorkspaceFile.getViewerSummaries()).map(
        (viewer) => viewer.email
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
    await file.recordView({
      verifiedEmail: "alice@david.co",
      viewedAt: new Date(),
    });
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
    expect(await file.getViewerSummaries()).toHaveLength(1);
    expect((await file.delete(authenticator)).isOk()).toBe(true);
    expect(await file.getViewerSummaries()).toEqual([]);
  });

  it("propagates database recording failures", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "conversation",
      status: "created",
    });
    expect((await file.delete(authenticator)).isOk()).toBe(true);
    await expect(
      file.recordView({
        verifiedEmail: "alice@david.co",
        viewedAt: new Date(),
      })
    ).rejects.toThrow(ForeignKeyConstraintError);
  });
});
