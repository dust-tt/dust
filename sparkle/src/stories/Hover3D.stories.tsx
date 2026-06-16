import type { Meta } from "@storybook/react";
import React from "react";

import { DustLogoSquare } from "@sparkle/logo/dust";

import { Div3D, GithubLogo, Hover3D, Icon } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/Hover3D",
  component: Hover3D,
  parameters: {
    docs: {
      description: {
        component: `A container that tilts in 3D toward the cursor, with nested **Div3D** children that shift along the Z axis by their **depth** to create a parallax, layered effect. Tune the tilt with **perspective** and **depth**, and set **fullscreenSensible** to track the cursor across the whole viewport rather than just the element.

**When to use**
- For showcase or marketing surfaces (logos, feature cards, hero imagery) where playful depth adds delight.

**Guidelines**
- Wrap each layer in a **Div3D** and stagger their **depth** values to control how far each pops forward or recedes.
- Reserve for non-essential decoration; keep it off dense, interactive UI where motion would distract.`,
      },
    },
  },
} satisfies Meta<typeof Hover3D>;

export default meta;

export const Hover3DExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-gap-4">
      <div>
        <Hover3D
          className="s-rounded-[30px] s-bg-gradient-to-r s-from-cyan-500 s-to-blue-500 s-p-10 s-shadow-xl"
          depth={-30}
        >
          <Div3D depth={20}>Coucou</Div3D>
          <Div3D depth={10}>Coucou</Div3D>
          <Div3D depth={40}>Coucou</Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D
          className="s-rounded-2xl s-bg-muted-background s-p-3 s-shadow-xl"
          depth={-20}
        >
          <Div3D depth={50}>
            <Icon visual={GithubLogo} size="xl" />
          </Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D className="s-rounded-[24px] s-bg-primary-800 s-p-8">
          <Div3D depth={60}>
            <Icon visual={DustLogoSquare} size="2xl" />
          </Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D
          className="s-relative s-h-44 s-w-44 s-rounded-[32px] s-bg-gradient-to-t s-from-stone-400 s-to-stone-300 s-p-2"
          depth={-10}
        >
          <Div3D depth={25} className="s-absolute s-h-40 s-w-40">
            <img src="http://test.edouardwautier.com/layer2.png" />
          </Div3D>
          <Div3D depth={50} className="s-absolute s-h-40 s-w-40">
            <img src="http://test.edouardwautier.com/layer3.png" />
          </Div3D>
        </Hover3D>
      </div>
    </div>

    <div className="s-flex s-gap-4">
      <div>
        <Hover3D
          className="s-rounded-[30px] s-bg-gradient-to-r s-from-cyan-500 s-to-blue-500 s-p-10 s-shadow-xl"
          perspective={1000}
          fullscreenSensible
        >
          <Div3D depth={20}>Coucou</Div3D>
          <Div3D depth={10}>Coucou</Div3D>
          <Div3D depth={40}>Coucou</Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D
          className="s-rounded-2xl s-bg-muted-background s-p-3 s-shadow-xl"
          depth={-20}
          perspective={1000}
          fullscreenSensible
        >
          <Div3D depth={50}>
            <Icon visual={GithubLogo} size="xl" />
          </Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D
          className="s-rounded-[24px] s-bg-primary-800 s-p-8"
          perspective={1000}
          fullscreenSensible
        >
          <Div3D depth={60}>
            <Icon visual={DustLogoSquare} size="2xl" />
          </Div3D>
        </Hover3D>
      </div>
      <div>
        <Hover3D
          className="s-relative s-h-44 s-w-44 s-rounded-[32px] s-bg-gradient-to-t s-from-stone-400 s-to-stone-300 s-p-2"
          depth={-10}
          perspective={1000}
          fullscreenSensible
        >
          <Div3D depth={25} className="s-absolute s-h-40 s-w-40">
            <img src="http://test.edouardwautier.com/layer2.png" />
          </Div3D>
          <Div3D depth={50} className="s-absolute s-h-40 s-w-40">
            <img src="http://test.edouardwautier.com/layer3.png" />
          </Div3D>
        </Hover3D>
      </div>
    </div>
  </div>
);
