import React from "react";

import * as SolidIcons from "../icons/solid";
import * as StrokeIcons from "../icons/stroke";
import { Icon } from "../index_with_tw_base";

export default {
  title: "Assets/Icons",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
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

export const SolidIconSet = () => (
  <div style={gridStyle}>
    {Object.entries(SolidIcons).map(([iconName, IconComponent]) => {
      const CurrentIcon = (
        "default" in IconComponent ? IconComponent.default : IconComponent
      ) as React.ComponentType<{ className?: string | undefined }>;
      return (
        <div key={iconName}>
          <Icon visual={CurrentIcon} size="md" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            {iconName}
          </div>
        </div>
      );
    })}
  </div>
);

export const StrokeIconSet = () => (
  <div style={gridStyle}>
    {Object.entries(StrokeIcons).map(([iconName, IconComponent]) => {
      const CurrentIcon = (
        "default" in IconComponent ? IconComponent.default : IconComponent
      ) as React.ComponentType<{ className?: string | undefined }>;
      return (
        <div key={iconName}>
          <Icon visual={CurrentIcon} size="md" />
          <div style={itemStyle as React.CSSProperties} className="s-text-sm">
            {iconName}
          </div>
        </div>
      );
    })}
  </div>
);
