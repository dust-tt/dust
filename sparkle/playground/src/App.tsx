import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListGroup,
  ListItem,
  MoonIcon,
  SunIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// Automatically discover all story files
// @ts-expect-error - import.meta.glob is a Vite feature
const storyModules = import.meta.glob("./stories/*.tsx", { eager: true });

// Extract story names and components (exclude TemplateSelection - only reachable via dropdown in Projects)
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

function StoryList({
  onSelectStory,
  theme,
  setTheme,
}: {
  onSelectStory: (name: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  return (
    <div className="s-flex s-min-h-screen s-items-start s-justify-center s-bg-background s-pt-6 dark:s-bg-background-night">
      <div className="s-w-full s-max-w-2xl s-px-4 s-text-left">
        <h1 className="s-heading-4xl s-mb-2 s-text-foreground dark:s-text-foreground-night">
          Playgrounds
        </h1>
        <div className="s-mb-4 s-flex s-items-center s-justify-between s-gap-2">
          <p className="s-text-base s-text-muted-foreground dark:s-text-muted-foreground-night">
            Select a playground to explore
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                isSelect
                icon={theme === "dark" ? MoonIcon : SunIcon}
                label={theme === "dark" ? "Dark" : "Light"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                icon={SunIcon}
                label="Light"
                onClick={() => setTheme("light")}
              />
              <DropdownMenuItem
                icon={MoonIcon}
                label="Dark"
                onClick={() => setTheme("dark")}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ListGroup>
          {stories.map((story, index) => (
            <ListItem
              key={story.name}
              onClick={() => onSelectStory(story.name)}
              hasSeparator={index < stories.length - 1}
            >
              <div className="s-text-foreground dark:s-text-foreground-night">
                {story.name}
              </div>
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

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("s-dark", isDark);
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

  if (currentStory) {
    const story = stories.find((s) => s.name === currentStory);
    if (story) {
      const StoryComponent = story.component;
      return <StoryComponent />;
    }
  }

  return (
    <StoryList
      onSelectStory={handleSelectStory}
      theme={theme}
      setTheme={setTheme}
    />
  );
}

export default App;
