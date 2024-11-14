// src/stories/MonBouton.stories.tsx
import type { Meta } from "@storybook/react";
import React from "react";
import { MonBouton } from "../components/MonBouton/MonBouton";

const meta = {
  title: "Primitives/MonBouton",
  component: MonBouton,
} satisfies Meta<typeof MonBouton>;

export default meta;

export const Examples = () => (
  <div className="s-bg-gray-900 s-p-8 s-flex s-flex-col s-gap-4">
    <MonBouton label="Bouton Purple" variant="purple" />
    <MonBouton label="Bouton Blue" variant="blue" />
    <MonBouton label="Bouton Green" variant="green" />
    <MonBouton 
      label="Sans Ripple" 
      variant="purple" 
      withRipple={false} 
    />
    <MonBouton 
      label="Désactivé" 
      variant="blue" 
      disabled 
    />
  </div>
);
