-- Migration created on Nov 14, 2025
CREATE TABLE IF NOT EXISTS "announcements" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "sId" VARCHAR(255) NOT NULL, "type" VARCHAR(255) NOT NULL, "slug" VARCHAR(255) NOT NULL UNIQUE, "title" VARCHAR(255) NOT NULL, "description" TEXT NOT NULL, "content" TEXT NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "isPublished" BOOLEAN NOT NULL DEFAULT false, "showInAppBanner" BOOLEAN NOT NULL DEFAULT false, "eventDate" TIMESTAMP WITH TIME ZONE, "eventTimezone" VARCHAR(255), "eventLocation" VARCHAR(255), "eventUrl" VARCHAR(255), "categories" JSONB, "tags" JSONB, "imageFileId" VARCHAR(255), "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "announcements_slug" ON "announcements" ("slug");
CREATE INDEX "announcements_type" ON "announcements" ("type");
CREATE INDEX "announcements_published_at" ON "announcements" ("publishedAt");
CREATE INDEX "announcements_is_published" ON "announcements" ("isPublished");
CREATE INDEX "announcements_show_in_app_banner" ON "announcements" ("showInAppBanner");
CREATE INDEX "announcements_event_date" ON "announcements" ("eventDate");
CREATE TABLE IF NOT EXISTS "announcement_banner_dismissals" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "announcementId" INTEGER NOT NULL REFERENCES "announcements" ("id") ON DELETE CASCADE ON UPDATE CASCADE, "userId" INTEGER NOT NULL REFERENCES "users" ("id"), "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "announcement_banner_dismissals_announcement_id_user_id" ON "announcement_banner_dismissals" ("announcementId", "userId");
CREATE INDEX "announcement_banner_dismissals_user_id" ON "announcement_banner_dismissals" ("userId");
