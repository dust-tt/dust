import { Button, Checkbox, Input, Spinner, TextArea } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";

import { MarkdownEditor } from "@app/components/poke/announcements/MarkdownEditor";
import {
  PokeForm,
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import type {
  AnnouncementContentType,
  AnnouncementType,
} from "@app/types/announcement";
import {
  ANNOUNCEMENT_TYPES,
  CHANGELOG_CATEGORIES,
} from "@app/types/announcement";

interface AnnouncementFormData {
  type: AnnouncementType;
  slug: string;
  title: string;
  description: string;
  content: string;
  status: "draft" | "published";
  publishedAt: string;
  showInAppBanner: boolean;
  eventDate: string;
  eventTimezone: string;
  eventLocation: string;
  eventUrl: string;
  categories: string;
  tags: string;
  imageFileId?: string | null;
}

interface AnnouncementFormProps {
  announcement?: AnnouncementContentType;
  onSubmit: (data: AnnouncementFormData) => Promise<void>;
  initialType?: AnnouncementType;
}

const COMMON_TIMEZONES = [
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "must",
  "can",
  "shall",
  "via",
  "per",
  "vs",
  "nor",
  "yet",
  "so",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
]);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !SMALL_WORDS.has(word))
    .join(" ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AnnouncementForm({
  announcement,
  onSubmit,
  initialType,
}: AnnouncementFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    announcement?.imageUrl || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form: UseFormReturn<AnnouncementFormData> =
    useForm<AnnouncementFormData>({
      defaultValues: {
        type: announcement?.type || initialType || "changelog",
        slug: announcement?.slug || "",
        title: announcement?.title || "",
        description: announcement?.description || "",
        content: announcement?.content || "",
        status: announcement?.isPublished ? "published" : "draft",
        publishedAt: announcement?.publishedAt
          ? new Date(announcement.publishedAt).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        showInAppBanner: announcement?.showInAppBanner || false,
        eventDate: announcement?.eventDate
          ? new Date(announcement.eventDate).toISOString().slice(0, 16)
          : "",
        eventTimezone: announcement?.eventTimezone || "Europe/Paris",
        eventLocation: announcement?.eventLocation || "",
        eventUrl: announcement?.eventUrl || "",
        categories: announcement?.categories?.[0] || "",
        tags: "",
        imageFileId: announcement?.imageFileId || null,
      },
    });

  const watchType = form.watch("type");
  const watchTitle = form.watch("title");
  const watchSlug = form.watch("slug");

  // Update image preview URL when announcement changes
  useEffect(() => {
    setImagePreviewUrl(announcement?.imageUrl || null);
  }, [announcement]);

  // Auto-generate slug from title if not manually edited
  useEffect(() => {
    if (!isSlugManuallyEdited && watchTitle) {
      const datePrefix = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      const slugifiedTitle = slugify(watchTitle);
      form.setValue("slug", `${datePrefix}-${slugifiedTitle}`, {
        shouldValidate: false,
      });
    }
  }, [watchTitle, isSlugManuallyEdited, form]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/poke/announcements/upload_image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      form.setValue("imageFileId", data.fileId);
      setImagePreviewUrl(data.url);
    } catch (error) {
      logger.error({ err: error }, "Failed to upload image");
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (data: AnnouncementFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      void router.push("/poke/announcements");
    } catch (error) {
      alert("Failed to save announcement. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PokeForm {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <SelectField
          control={form.control}
          name="type"
          title="Type"
          options={ANNOUNCEMENT_TYPES.map((t) => ({
            value: t,
            display: t.charAt(0).toUpperCase() + t.slice(1),
          }))}
        />

        <InputField
          control={form.control}
          name="title"
          title="Title"
          placeholder="Enter title"
        />

        <PokeFormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <PokeFormItem>
              <div className="flex items-center justify-between">
                <PokeFormLabel>Slug</PokeFormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  label={isSlugEditable ? "Lock" : "Edit"}
                  onClick={() => {
                    setIsSlugEditable(!isSlugEditable);
                    if (!isSlugEditable) {
                      setIsSlugManuallyEdited(true);
                    }
                  }}
                />
              </div>
              <PokeFormControl>
                <Input
                  {...field}
                  value={field.value}
                  disabled={!isSlugEditable}
                  placeholder="e.g., 20250610-new-feature"
                  onChange={(e) => {
                    field.onChange(e);
                    setIsSlugManuallyEdited(true);
                  }}
                />
              </PokeFormControl>
              <PokeFormMessage />
            </PokeFormItem>
          )}
        />

        <PokeFormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <PokeFormItem>
              <PokeFormLabel>Description</PokeFormLabel>
              <PokeFormControl>
                <TextArea
                  placeholder="Short description"
                  {...field}
                  value={field.value}
                  minRows={2}
                />
              </PokeFormControl>
              <PokeFormMessage />
            </PokeFormItem>
          )}
        />

        <PokeFormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <PokeFormItem>
              <PokeFormLabel>Content (Markdown)</PokeFormLabel>
              <MarkdownEditor
                value={field.value}
                onChange={field.onChange}
                placeholder="Write your announcement content in markdown..."
              />
              <PokeFormMessage />
            </PokeFormItem>
          )}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium">Image (Optional)</label>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isUploadingImage}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
            {isUploadingImage && <Spinner size="xs" variant="color" />}
          </div>
          {imagePreviewUrl && (
            <div className="mt-2">
              <img
                src={imagePreviewUrl}
                alt="Preview"
                className="h-32 w-auto rounded border"
              />
            </div>
          )}
        </div>

        <PokeFormField
          control={form.control}
          name="publishedAt"
          render={({ field }) => (
            <PokeFormItem>
              <PokeFormLabel>Published At</PokeFormLabel>
              <PokeFormControl>
                <Input type="datetime-local" {...field} value={field.value} />
              </PokeFormControl>
              <PokeFormMessage />
            </PokeFormItem>
          )}
        />

        {watchType === "changelog" && (
          <SelectField
            control={form.control}
            name="categories"
            title="Category"
            options={CHANGELOG_CATEGORIES.map((cat) => ({
              value: cat,
              display: cat
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase()),
            }))}
          />
        )}

        {watchType === "event" && (
          <>
            <PokeFormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <PokeFormItem>
                  <PokeFormLabel>Event Date</PokeFormLabel>
                  <PokeFormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      value={field.value}
                    />
                  </PokeFormControl>
                  <PokeFormMessage />
                </PokeFormItem>
              )}
            />

            <SelectField
              control={form.control}
              name="eventTimezone"
              title="Event Timezone"
              options={COMMON_TIMEZONES.map((tz) => ({
                value: tz,
                display: tz.replace(/_/g, " "),
              }))}
            />

            <InputField
              control={form.control}
              name="eventLocation"
              title="Event Location"
              placeholder="e.g., San Francisco, CA or Online"
            />

            <InputField
              control={form.control}
              name="eventUrl"
              title="Event URL"
              placeholder="https://..."
            />
          </>
        )}

        <SelectField
          control={form.control}
          name="status"
          title="Status"
          options={[
            { value: "draft", display: "Draft" },
            { value: "published", display: "Published" },
          ]}
        />

        <PokeFormField
          control={form.control}
          name="showInAppBanner"
          render={({ field }) => (
            <PokeFormItem className="flex items-center gap-2">
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <PokeFormLabel className="!mt-0">
                Show as In-App Banner
              </PokeFormLabel>
            </PokeFormItem>
          )}
        />

        <div className="flex gap-4">
          <Button
            type="submit"
            variant="highlight"
            disabled={isSubmitting}
            label={isSubmitting ? "Saving..." : "Save"}
          />
          <Button
            type="button"
            variant="outline"
            label="Cancel"
            onClick={() => router.back()}
          />
        </div>
      </form>
    </PokeForm>
  );
}
