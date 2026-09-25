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
  // Read the hash during initialization, not in an effect: the "write the hash"
  // effect below runs on the same mount pass and would otherwise clear it,
  // breaking deep links like `?tools=salesforce#ManageAgents`.
  const [currentStory, setCurrentStory] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const hash = window.location.hash.slice(1);
    return hash && stories.some((s) => s.name === hash) ? hash : null;
  });
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

  // Update URL hash when story changes, preserving any query string (the
  // fleet screens keep their filters there).
  useEffect(() => {
    const url = `${window.location.pathname}${window.location.search}${
      currentStory ? `#${currentStory}` : ""
    }`;
    window.history.replaceState(null, "", url);
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
