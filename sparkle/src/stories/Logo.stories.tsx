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
  title: "Assets/DustLogo",
  tags: ["autodocs"],
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
        <div className="s-p-6">
          <DustLogo className="s-h-8 s-w-32" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            DustLogo
          </div>
        </div>
        <div className="s-p-6">
          <DustLogoGray className="s-h-8 s-w-32" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            DustLogoGray
          </div>
        </div>
        <div className="s-bg-primary-800 s-p-6">
          <DustLogoWhite className="s-h-8 s-w-32" />
          <div
            style={itemStyle as React.CSSProperties}
            className="s-text-sm s-text-white"
          >
            DustLogoWhite
          </div>
        </div>
      </div>

      <div style={gridStyle}>
        <div className="s-p-6">
          <DustLogoSquare className="s-h-16 s-w-16" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            DustLogoSquare
          </div>
        </div>
        <div className="s-p-6">
          <DustLogoSquareGray className="s-h-16 s-w-16" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            DustLogoSquareGray
          </div>
        </div>
        <div className="s-bg-primary-800 s-p-6">
          <DustLogoSquareWhite className="s-h-16 s-w-16" />
          <div
            style={itemStyle as React.CSSProperties}
            className="s-text-sm s-text-white"
          >
            DustLogoWhite
          </div>
        </div>
      </div>

      <div style={gridStyle}>
        <div className="s-p-6">
          <Hover3D className="s-relative s-h-8 s-w-32">
            <Div3D depth={0} className="s-h-8 s-w-32">
              <DustLogoLayer1 className="s-h-8 s-w-32" />
            </Div3D>
            <Div3D depth={25} className="s-absolute s-top-0">
              <DustLogoLayer2 className="s-h-8 s-w-32" />
            </Div3D>
          </Hover3D>
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            Horizontal Hover3D
          </div>
        </div>
        <div className="s-p-6">
          <Hover3D className="s-relative s-h-16 s-w-16">
            <Div3D depth={0} className="s-h-16 s-w-16">
              <DustLogoSquareLayer1 className="s-h-16 s-w-16" />
            </Div3D>
            <Div3D depth={25} className="s-absolute s-top-0">
              <DustLogoSquareLayer2 className="s-h-16 s-w-16" />
            </Div3D>
          </Hover3D>
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            Square Hover3D
          </div>
        </div>
      </div>
    </>
  ),
};
