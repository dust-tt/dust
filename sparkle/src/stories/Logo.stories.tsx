import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Div3D, Hover3D } from "..";
import {
  DustLogo,
  DustLogoGray,
  DustLogoLayer1,
  DustLogoLayer2,
  DustLogoSquare,
  DustLogoSquareGray,
  DustLogoSquareLayer1,
  DustLogoSquareLayer2,
  DustLogoSquareWhite,
  DustLogoWhite,
} from "../logo/dust";

const meta = {
  title: "Assets/Logo",
  tags: ["!manifest", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `The Dust logo assets (\`@sparkle/logo/dust\`): wordmark and square marks, including white, gray, and layered variants for 3D/parallax treatments. Import the variant that suits the background and context rather than recreating the mark. Reach for **DustLogoWhite** / **DustLogoSquareWhite** on dark surfaces.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "48px 16px",
};
const itemStyle = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

export const DustLogos: Story = {
  render: () => (
    <>
      <div style={gridStyle}>
        <div className="p-6">
          <DustLogo className="h-8 w-32" />
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            DustLogo
          </div>
        </div>
        <div className="p-6">
          <DustLogoGray className="h-8 w-32" />
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            DustLogoGray
          </div>
        </div>
        <div className="bg-primary-800 p-6">
          <DustLogoWhite className="h-8 w-32" />
          <div
            style={itemStyle as React.CSSProperties}
            className="text-sm text-white"
          >
            DustLogoWhite
          </div>
        </div>
      </div>

      <div style={gridStyle}>
        <div className="p-6">
          <DustLogoSquare className="h-16 w-16" />
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            DustLogoSquare
          </div>
        </div>
        <div className="p-6">
          <DustLogoSquareGray className="h-16 w-16" />
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            DustLogoSquareGray
          </div>
        </div>
        <div className="bg-primary-800 p-6">
          <DustLogoSquareWhite className="h-16 w-16" />
          <div
            style={itemStyle as React.CSSProperties}
            className="text-sm text-white"
          >
            DustLogoWhite
          </div>
        </div>
      </div>

      <div style={gridStyle}>
        <div className="p-6">
          <Hover3D className="relative h-8 w-32">
            <Div3D depth={0} className="h-8 w-32">
              <DustLogoLayer1 className="h-8 w-32" />
            </Div3D>
            <Div3D depth={25} className="absolute top-0">
              <DustLogoLayer2 className="h-8 w-32" />
            </Div3D>
          </Hover3D>
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            Horizontal Hover3D
          </div>
        </div>
        <div className="p-6">
          <Hover3D className="relative h-16 w-16">
            <Div3D depth={0} className="h-16 w-16">
              <DustLogoSquareLayer1 className="h-16 w-16" />
            </Div3D>
            <Div3D depth={25} className="absolute top-0">
              <DustLogoSquareLayer2 className="h-16 w-16" />
            </Div3D>
          </Hover3D>
          <div style={itemStyle as React.CSSProperties} className="text-sm">
            Square Hover3D
          </div>
        </div>
      </div>
    </>
  ),
};
