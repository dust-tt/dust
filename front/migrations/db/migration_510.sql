-- Migration created on Feb 12, 2026
CREATE TABLE IF NOT EXISTS "academy_quiz_attempts" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "sId" VARCHAR(255) NOT NULL,
  "userId" BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "browserId" VARCHAR(36),
  "contentType" VARCHAR(255) NOT NULL,
  "contentSlug" VARCHAR(255) NOT NULL,
  "courseSlug" VARCHAR(255),
  "correctAnswers" INTEGER NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "isPassed" BOOLEAN NOT NULL
);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id" ON "academy_quiz_attempts" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id_content_type_content_slug" ON "academy_quiz_attempts" ("userId", "contentType", "contentSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id_course_slug" ON "academy_quiz_attempts" ("userId", "courseSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id" ON "academy_quiz_attempts" ("browserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id_content_type_content_slug" ON "academy_quiz_attempts" ("browserId", "contentType", "contentSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id_course_slug" ON "academy_quiz_attempts" ("browserId", "courseSlug");

CREATE TABLE IF NOT EXISTS "academy_chapter_visits" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "sId" VARCHAR(255) NOT NULL,
  "userId" BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "browserId" VARCHAR(36),
  "courseSlug" VARCHAR(255) NOT NULL,
  "chapterSlug" VARCHAR(255) NOT NULL
);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id_course_chapter_unique" ON "academy_chapter_visits" ("userId", "courseSlug", "chapterSlug");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_browser_id_course_chapter_unique" ON "academy_chapter_visits" ("browserId", "courseSlug", "chapterSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id_course_slug" ON "academy_chapter_visits" ("userId", "courseSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id" ON "academy_chapter_visits" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_browser_id" ON "academy_chapter_visits" ("browserId");
