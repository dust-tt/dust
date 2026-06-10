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
import { useEffect, useState } from "react";

// Automatically discover all story files
// @ts-expect-error - import.meta.glob is a Vite feature
const storyModules = import.meta.glob("./stories/*.tsx", { eager: true });

// Extract story names and components (exclude TemplateSelection - only reachable via dropdown in Pods)
const DISABLED_STORIES = new Set(["AdminGovernance"]);
const HIDDEN_STORIES = new Set([
  "AgentBuilder",
  "Conversation",
  "Frame",
  "Panels",
  "Pods",
  "Pods_After",
  "Pods_as_Spaces",
]);

const stories = Object.entries(storyModules)
  .map(([path, module]: [string, any]) => {
    const fileName = path.split("/").pop()?.replace(".tsx", "") || "";
    const displayName =
      (module as { storyName?: string }).storyName ?? fileName;
    return {
      name: fileName,
      displayName,
      component: (module as { default: React.ComponentType }).default,
      disabled: DISABLED_STORIES.has(fileName),
    };
  })
  .filter((s) => s.name !== "TemplateSelection" && !HIDDEN_STORIES.has(s.name));

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
    <div className="flex min-h-screen items-start justify-center bg-background pt-6">
      <div className="w-full max-w-2xl px-4 text-left">
        <h1 className="heading-4xl mb-2 text-foreground">Playgrounds</h1>
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-base text-muted-foreground">
            Select a playground to explore
          </p>
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
        <ListGroup>
          {stories.map((story, index) => (
            <ListItem
              key={story.name}
              onClick={
                story.disabled ? undefined : () => onSelectStory(story.name)
              }
              hasSeparator={index < stories.length - 1}
            >
              <div
                className={
                  story.disabled
                    ? "text-muted-foreground opacity-40 cursor-not-allowed select-none"
                    : "text-foreground"
                }
              >
                {story.displayName}
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
