import React from "react";

import { Div3D, Hover3D, LogoSquareColorLogoLayer2 } from "..";
import {
  LogoHorizontalColor,
  LogoHorizontalColorLayer1,
  LogoHorizontalColorLayer2,
  LogoHorizontalDark,
  LogoHorizontalWhite,
  LogoSquareColor,
  LogoSquareColorLayer1,
  LogoSquareDark,
  LogoSquareWhite,
} from "../logo/dust";

export default {
  title: "Assets/DustLogo",
};

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

export const DustLogo = () => (
  <>
    <div style={gridStyle}>
      <div className="s-p-6">
        <LogoHorizontalColor className="s-h-8 s-w-32" />
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          LogoHorizontalColorLogo
        </div>
      </div>
      <div className="s-p-6">
        <LogoHorizontalDark className="s-h-8 s-w-32" />
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          LogoHorizontalDarkLogo
        </div>
      </div>
      <div className="s-bg-slate-800 s-p-6">
        <LogoHorizontalWhite className="s-h-8 s-w-32" />
        <div
          style={itemStyle as React.CSSProperties}
          className="s-text-sm s-text-white"
        >
          LogoHorizontalWhiteLogo
        </div>
      </div>
    </div>

    <div style={gridStyle}>
      <div className="s-p-6">
        <LogoSquareColor className="s-h-16 s-w-16" />
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          LogoHorizontalColorLogo
        </div>
      </div>
      <div className="s-p-6">
        <LogoSquareDark className="s-h-16 s-w-16" />
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          LogoHorizontalDarkLogo
        </div>
      </div>
      <div className="s-bg-slate-800 s-p-6">
        <LogoSquareWhite className="s-h-16 s-w-16" />
        <div
          style={itemStyle as React.CSSProperties}
          className="s-text-sm s-text-white"
        >
          LogoHorizontalWhiteLogo
        </div>
      </div>
    </div>

    <div style={gridStyle}>
      <div className="s-p-6">
        <Hover3D className="s-relative s-h-8 s-w-32">
          <Div3D depth={0} className="s-h-8 s-w-32">
            <LogoHorizontalColorLayer1 className="s-h-8 s-w-32" />
          </Div3D>
          <Div3D depth={25} className="s-absolute s-top-0">
            <LogoHorizontalColorLayer2 className=" s-h-8 s-w-32" />
          </Div3D>
        </Hover3D>
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          Horizontal Hover3D
        </div>
      </div>
      <div className="s-p-6">
        <Hover3D className="s-relative s-h-16 s-w-16">
          <Div3D depth={0} className="s-h-16 s-w-16">
            <LogoSquareColorLayer1 className="s-h-16 s-w-16" />
          </Div3D>
          <Div3D depth={25} className="s-absolute s-top-0">
            <LogoSquareColorLogoLayer2 className=" s-h-16 s-w-16" />
          </Div3D>
        </Hover3D>
        <div style={itemStyle as React.CSSProperties} className="s-text-sm">
          Square Hover3D
        </div>
      </div>
    </div>
  </>
);
