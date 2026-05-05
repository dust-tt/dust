import type { TocItem } from "@app/lib/contentful/tableOfContents";
import type { Document } from "@contentful/rich-text-types";
import type { Asset, Entry, EntrySkeletonType } from "contentful";

export interface AuthorFields {
  name?: string;
  image?: Asset;
  email?: string;
}

export type AuthorSkeleton = EntrySkeletonType<AuthorFields, "author">;

export interface BlogPageFields {
  title: string;
  slug?: string;
  body: Document;
  image?: Asset;
  publishedAt?: string;
  authors?: Entry<AuthorSkeleton>[];
  isSeoArticle?: boolean;
}

export type BlogPageSkeleton = EntrySkeletonType<BlogPageFields, "blogPage">;

export interface BlogImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface BlogAuthor {
  name: string;
  image: BlogImage | null;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: Document;
  tags: string[];
  image: BlogImage | null;
  authors: BlogAuthor[];
  createdAt: string;
  updatedAt: string;
  isSeoArticle: boolean;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  image: BlogImage | null;
  createdAt: string;
  isSeoArticle: boolean;
}

export interface BlogListingPageProps {
  posts: BlogPostSummary[];
  gtmTrackingId: string | null;
}

export interface BlogPostPageProps {
  post: BlogPost;
  relatedPosts: BlogPostSummary[];
  gtmTrackingId: string | null;
  preview?: boolean;
}

// Customer Story types

export interface CustomerStoryFields {
  // Required
  title: string;
  slug: string;
  companyName: string;
  body: Document;
  industry: string;
  industries?: string[];
  department: string[];

  // Customer info (optional)
  companyLogo?: Asset;
  companyWebsite?: string;

  // Contact person (optional)
  contactName?: string;
  contactTitle?: string;
  contactPhoto?: Asset;

  // Metrics (optional)
  headlineMetric?: string;
  keyHighlight?: Document;

  // Filtering (optional)
  companySize?: string;
  region?: string[];

  // Media (optional)
  heroImage?: Asset;
  gallery?: Asset[];

  // Publishing
  publishedAt?: string;
  featured?: boolean;

  // SEO
  metaDescription?: string;

  // UTM tracking
  utmCampaign?: string;
}

export type CustomerStorySkeleton = EntrySkeletonType<
  CustomerStoryFields,
  "customerStory"
>;

export interface CustomerStory {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  companyLogo: BlogImage | null;
  companyWebsite: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhoto: BlogImage | null;
  headlineMetric: string | null;
  keyHighlight: Document | null;
  industry: string;
  industries: string[];
  department: string[];
  companySize: string | null;
  region: string[];
  description: string | null;
  body: Document;
  heroImage: BlogImage | null;
  gallery: BlogImage[];
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  utmCampaign: string | null;
}

export interface CustomerStorySummary {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  companyLogo: BlogImage | null;
  headlineMetric: string | null;
  description: string | null;
  heroImage: BlogImage | null;
  industry: string;
  industries: string[];
  department: string[];
  companySize: string | null;
  region: string[];
  featured: boolean;
  createdAt: string;
}

export interface CustomerStoryFilters {
  industry?: string[];
  industries?: string[];
  department?: string[];
  companySize?: string[];
  region?: string[];
  featured?: boolean;
}

export interface CustomerStoryFilterOptions {
  industries: string[];
  departments: string[];
  companySizes: string[];
  regions: string[];
}

export interface CustomerStoryListingPageProps {
  stories: CustomerStorySummary[];
  filterOptions: CustomerStoryFilterOptions;
  gtmTrackingId: string | null;
}

export interface CustomerStoryPageProps {
  story: CustomerStory;
  relatedStories: CustomerStorySummary[];
  gtmTrackingId: string | null;
  preview?: boolean;
}

// Course types

export interface CourseFields {
  title: string;
  dateOfAddition: string;
  courseImage: Asset;
  description: string;
  courseId: string;
  slug: string;
  tableOfContents?: string;
  estimatedDurationMinutes?: number;
  preRequisites?: Document;
  courseContent: Document;
  previousCourse?: Entry<CourseSkeleton>;
  nextCourse?: Entry<CourseSkeleton>;
  author?: Entry<AuthorSkeleton>;
  chapters?: Entry<ChapterSkeleton>[];
}

export type CourseSkeleton = EntrySkeletonType<CourseFields, "course">;

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dateOfAddition: string | null;
  estimatedDurationMinutes: number | null;
  courseContent: Document;
  preRequisites: Document | null;
  tableOfContents: string | null;
  image: BlogImage | null;
  author: BlogAuthor | null;
  previousCourse: CourseSummary | null;
  nextCourse: CourseSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseSummary {
  kind: "course";
  id: string;
  slug: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dateOfAddition: string | null;
  estimatedDurationMinutes: number | null;
  image: BlogImage | null;
  createdAt: string;
  chapterCount: number;
  chapterSlugs: string[];
  chapters: { slug: string; title: string }[];
}

export interface SearchableItem {
  type: "course" | "lesson" | "chapter" | "section";
  contentType: "course" | "lesson" | "chapter";
  slug: string;
  title: string;
  image: BlogImage | null;
  sectionId: string | null;
  sectionTitle: string | null;
  searchText: string;
  courseSlug?: string | null;
}

export type AcademyLocale = "en-US" | "fr";

export const ACADEMY_LOCALES: AcademyLocale[] = ["en-US", "fr"];

export const ACADEMY_LOCALE_LABELS: Record<AcademyLocale, string> = {
  "en-US": "EN",
  fr: "FR",
};

export const DEFAULT_ACADEMY_LOCALE: AcademyLocale = "en-US";

export const ACADEMY_LOCALE_COOKIE = "academy_locale";

export function isAcademyLocale(value: string): value is AcademyLocale {
  return ACADEMY_LOCALES.some((l) => l === value);
}

export type QuizSettingsSkeleton = EntrySkeletonType<
  QuizSettings,
  "quizSettings"
>;

export interface QuizSettings {
  quizTitle: string;
  quizSubtitle: string;
  quizGreetingUser: string;
  quizGreetingGeneric: string;
  quizCompleted: string;
  quizBestScore: string;
  quizAttempts: string;
  quizStartButton: string;
  quizRetakeButton: string;
  quizStarting: string;
  quizReset: string;
  quizThinking: string;
  quizAnswerPlaceholder: string;
  quizSubmit: string;
  quizGreatScoreAgain: string;
  quizChapterCompleted: string;
  quizPerfectScore: string;
  quizPassedMessage: string;
  quizComplete: string;
  quizFailMessage: string;
  quizTryAgain: string;
  quizYou: string;
  quizCorrect: string;
  quizQuestion: string;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  quizTitle: "Test Your Knowledge",
  quizSubtitle: "Answer 5 questions — score 3 or more to pass",
  quizGreetingUser: "Ready to test your understanding, {name}?",
  quizGreetingGeneric: "Ready to test your understanding of this content?",
  quizCompleted: "Completed",
  quizBestScore: "Best score",
  quizAttempts: "attempts",
  quizStartButton: "Start Quiz",
  quizRetakeButton: "Take Quiz Again",
  quizStarting: "Starting quiz...",
  quizReset: "Reset",
  quizThinking: "Thinking...",
  quizAnswerPlaceholder: "Type your answer...",
  quizSubmit: "Submit",
  quizGreatScoreAgain: "Great Score Again!",
  quizChapterCompleted: "Chapter Completed!",
  quizPerfectScore: "Excellent work! You've mastered this content.",
  quizPassedMessage: "Well done! You passed the quiz.",
  quizComplete: "Quiz Complete",
  quizFailMessage:
    "You need at least {passing}/{total} to pass. Review the content and try again!",
  quizTryAgain: "Try Again",
  quizYou: "You",
  quizCorrect: "correct",
  quizQuestion: "Question",
};

export type AcademySettingsSkeleton = EntrySkeletonType<
  AcademySettings,
  "academySettings"
>;

export interface AcademySettings {
  academyTitle: string;
  academySubtitle: string;
  searchPlaceholder: string;
  continueLearning: string;
  backToAcademy: string;
  continueButton: string;
  startLearning: string;
  featuredCourse: string;
  chapterRead: string;
  quizPassed: string;
  courseObjectives: string;
  prerequisites: string;
  chapters: string;
  copyAsMarkdown: string;
  copied: string;
  previousCourse: string;
  nextCourse: string;
  previousChapter: string;
  nextChapter: string;
  lessonObjectives: string;
  previousContent: string;
  nextContent: string;
  course: string;
  lesson: string;
  noCourses: string;
  mobileMenuTitle: string;
  completed: string;
  backTo: string;
}

export const DEFAULT_ACADEMY_SETTINGS: AcademySettings = {
  academyTitle: "Dust Academy",
  academySubtitle:
    "Check out our courses, tutorials, and videos to learn everything about Dust",
  searchPlaceholder: "Search...",
  continueLearning: "Continue Learning",
  backToAcademy: "Back to Academy",
  continueButton: "Continue",
  startLearning: "Start learning",
  featuredCourse: "Featured Course",
  chapterRead: "Chapter read",
  quizPassed: "Quiz passed",
  courseObjectives: "Course Objectives",
  prerequisites: "Prerequisites",
  chapters: "Chapters",
  copyAsMarkdown: "Copy as Markdown",
  copied: "Copied!",
  previousCourse: "Previous Course",
  nextCourse: "Next Course",
  previousChapter: "Previous Chapter",
  nextChapter: "Next Chapter",
  lessonObjectives: "Lesson Objectives",
  previousContent: "Previous",
  nextContent: "Next",
  course: "Course",
  lesson: "Lesson",
  noCourses: "No courses available yet. Check back soon!",
  mobileMenuTitle: "Academy",
  completed: "Completed",
  backTo: "Back to {title}",
};

export interface AcademyUser {
  firstName: string;
  sId: string;
}

export interface CourseListingPageProps {
  courses: CourseSummary[];
  searchableItems: SearchableItem[];
  gtmTrackingId: string | null;
  academyUser?: AcademyUser | null;
  locale: AcademyLocale;
  academySettings: AcademySettings;
}

export interface CoursePageProps {
  course: Course;
  courses: CourseSummary[];
  chapters: ChapterSummary[];
  searchableItems: SearchableItem[];
  gtmTrackingId: string | null;
  academyUser?: AcademyUser | null;
  fullWidth?: boolean;
  preview?: boolean;
  locale: AcademyLocale;
  academySettings: AcademySettings;
  quizSettings: QuizSettings;
}

// Chapter types

export interface ChapterFields {
  title: string;
  slug: string;
  chapterContent: Document;
  description?: string;
  estimatedDurationMinutes?: number;
}

export type ChapterSkeleton = EntrySkeletonType<ChapterFields, "chapter">;

export interface Chapter {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  chapterContent: Document;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  kind: "chapter";
  id: string;
  slug: string;
  title: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  tocItems: TocItem[];
  createdAt: string;
}

export function isChapterSummary(
  content: ContentSummary
): content is ChapterSummary {
  return content.kind === "chapter";
}

export interface ChapterPageProps {
  chapter: Chapter;
  chapters: ChapterSummary[];
  courseSlug: string;
  courseTitle: string;
  courseImage: BlogImage | null;
  courseAuthor: BlogAuthor | null;
  searchableItems: SearchableItem[];
  gtmTrackingId: string | null;
  academyUser?: AcademyUser | null;
  fullWidth?: boolean;
  preview?: boolean;
  locale: AcademyLocale;
  academySettings: AcademySettings;
  quizSettings: QuizSettings;
}

// Lesson types

export interface LessonFields {
  title: string;
  dateOfAddition: string;
  description: string;
  lessonObjectives?: string;
  lessonId: string;
  slug: string;
  estimatedDurationMinutes?: number;
  preRequisites?: Document;
  lessonContent: Document;
  previousContent?: Entry<CourseSkeleton | LessonSkeleton>;
  nextContent?: Entry<CourseSkeleton | LessonSkeleton>;
  Category?: string;
  tools?: string[];
  complexity?: string;
  parentCourse?: Entry<CourseSkeleton>;
}

export type LessonSkeleton = EntrySkeletonType<LessonFields, "lesson">;

export type ContentSummary = CourseSummary | LessonSummary | ChapterSummary;

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  lessonId: string | null;
  dateOfAddition: string | null;
  estimatedDurationMinutes: number | null;
  lessonObjectives: string | null;
  lessonContent: Document;
  preRequisites: Document | null;
  previousContent: ContentSummary | null;
  nextContent: ContentSummary | null;
  category: string | null;
  tools: string[];
  complexity: string | null;
  parentCourse: CourseSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonSummary {
  kind: "lesson";
  id: string;
  slug: string;
  title: string;
  description: string | null;
  lessonId: string | null;
  estimatedDurationMinutes: number | null;
  createdAt: string;
}

export function isCourseSummary(
  content: ContentSummary
): content is CourseSummary {
  return content.kind === "course";
}

export function isLessonSummary(
  content: ContentSummary
): content is LessonSummary {
  return content.kind === "lesson";
}

export interface LessonPageProps {
  lesson: Lesson;
  searchableItems: SearchableItem[];
  gtmTrackingId: string | null;
  academyUser?: AcademyUser | null;
  preview?: boolean;
  locale: AcademyLocale;
  academySettings: AcademySettings;
  quizSettings: QuizSettings;
}
