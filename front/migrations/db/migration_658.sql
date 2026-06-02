CREATE TABLE "workspace_seat_limits" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "seatType" VARCHAR(255) NOT NULL,
    "minSeats" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workspace_seat_limits_workspace_seat_type_idx" ON "workspace_seat_limits" ("workspaceId", "seatType");
