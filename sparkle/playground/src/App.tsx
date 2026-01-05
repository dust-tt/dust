import { useEffect, useState } from "react";
import { Button } from "@dust-tt/sparkle";

// Automatically discover all story files
// @ts-expect-error - import.meta.glob is a Vite feature
const storyModules = import.meta.glob("./stories/*.tsx", { eager: true });

// Extract story names and components
const stories = Object.entries(storyModules).map(
  ([path, module]: [string, any]) => {
    const name = path.split("/").pop()?.replace(".tsx", "") || "";
    return {
      name,
      component: module.default,
    };
  }
);

function StoryList({
  onSelectStory,
}: {
  onSelectStory: (name: string) => void;
}) {
  return (
    <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background">
      <div className="s-w-full s-max-w-2xl s-px-4 s-text-center">
        <h1 className="s-heading-4xl s-mb-4 s-text-foreground">Playgrounds</h1>
        <p className="s-copy-lg s-mb-8 s-text-muted-foreground">
          Select a playground to explore
        </p>
        <div className="s-flex s-flex-col s-items-center s-gap-3">
          {stories.map((story) => (
            <Button
              key={story.name}
              label={story.name}
              onClick={() => onSelectStory(story.name)}
              size="md"
              variant="primary"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentStory, setCurrentStory] = useState<string | null>(null);

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

  return <StoryList onSelectStory={handleSelectStory} />;
}

export default App;
