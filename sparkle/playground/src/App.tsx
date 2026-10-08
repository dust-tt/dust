import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListGroup,
  ListItem,
  Moon01,
  Sun,
} from "@dust-tt/sparkle";
import {
  SPARKLE_FORMAT_LOCALES,
  type SparkleCatalogLocale,
  type SparkleFormatLocale,
  SparkleI18nProvider,
} from "@sparkle/lib/i18n";
import { useEffect, useState } from "react";

// Automatically discover all story files
// @ts-expect-error - import.meta.glob is a Vite feature
const storyModules = import.meta.glob("./stories/*.tsx", { eager: true });

// Extract story names and components (exclude TemplateSelection - only reachable via dropdown in Pods)
const stories = Object.entries(storyModules)
  .map(([path, module]: [string, any]) => {
    const name = path.split("/").pop()?.replace(".tsx", "") || "";
    return {
      name,
      component: (module as { default: React.ComponentType }).default,
    };
  })
  .filter((s) => s.name !== "TemplateSelection");

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "sparkle-playground-theme";

const LOCALE_STORAGE_KEY = "sparkle-playground-locale";
// Mirrors front's `LOCALE_LABELS` and `CATALOG_LOCALE_BY_LOCALE`: `en-GB` formats the UK way but
// renders the `en-US` catalog.
const LOCALE_LABELS: Record<SparkleFormatLocale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "fr-FR": "Français",
};
const CATALOG_LOCALE_BY_LOCALE: Record<
  SparkleFormatLocale,
  SparkleCatalogLocale
> = {
  "en-US": "en-US",
  "en-GB": "en-US",
  "fr-FR": "fr-FR",
};

function isSparkleFormatLocale(
  value: string | null,
): value is SparkleFormatLocale {
  return SPARKLE_FORMAT_LOCALES.some((locale) => locale === value);
}

function StoryList({
  onSelectStory,
  theme,
  setTheme,
  locale,
  setLocale,
}: {
  onSelectStory: (name: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  locale: SparkleFormatLocale;
  setLocale: (locale: SparkleFormatLocale) => void;
}) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-background pt-6">
      <div className="w-full max-w-2xl px-4 text-left">
        <h1 className="heading-4xl mb-2 text-foreground">Playgrounds</h1>
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-base text-muted-foreground">
            Select a playground to explore
          </p>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  label={LOCALE_LABELS[locale]}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SPARKLE_FORMAT_LOCALES.map((option) => (
                  <DropdownMenuItem
                    key={option}
                    label={LOCALE_LABELS[option]}
                    onClick={() => setLocale(option)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  icon={theme === "dark" ? Moon01 : Sun}
                  label={theme === "dark" ? "Dark" : "Light"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  icon={Sun}
                  label="Light"
                  onClick={() => setTheme("light")}
                />
                <DropdownMenuItem
                  icon={Moon01}
                  label="Dark"
                  onClick={() => setTheme("dark")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ListGroup>
          {stories.map((story, index) => (
            <ListItem
              key={story.name}
              onClick={() => onSelectStory(story.name)}
              hasSeparator={index < stories.length - 1}
            >
              <div className="text-foreground">{story.name}</div>
            </ListItem>
          ))}
        </ListGroup>
      </div>
    </div>
  );
}

function App() {
  const [currentStory, setCurrentStory] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  });

  const [locale, setLocale] = useState<SparkleFormatLocale>(() => {
    if (typeof window === "undefined") {
      return "en-US";
    }
    const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSparkleFormatLocale(storedLocale) ? storedLocale : "en-US";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Read initial hash from URL
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove the #
    if (hash && stories.some((s) => s.name === hash)) {
      setCurrentStory(hash);
    }
  }, []);

  // Update URL hash when story changes
  useEffect(() => {
    if (currentStory) {
      window.location.hash = currentStory;
    } else {
      window.location.hash = "";
    }
  }, [currentStory]);

  // Listen for hash changes (back button)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && stories.some((s) => s.name === hash)) {
        setCurrentStory(hash);
      } else {
        setCurrentStory(null);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleSelectStory = (name: string) => {
    setCurrentStory(name);
  };

  const story = currentStory
    ? stories.find((s) => s.name === currentStory)
    : undefined;
  const StoryComponent = story?.component;

  return (
    <SparkleI18nProvider
      locale={CATALOG_LOCALE_BY_LOCALE[locale]}
      formatLocale={locale}
    >
      {StoryComponent ? (
        <StoryComponent />
      ) : (
        <StoryList
          onSelectStory={handleSelectStory}
          theme={theme}
          setTheme={setTheme}
          locale={locale}
          setLocale={setLocale}
        />
      )}
    </SparkleI18nProvider>
  );
}

export default App;
