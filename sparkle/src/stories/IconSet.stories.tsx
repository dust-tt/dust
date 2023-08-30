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
  overflow: "hidden", // Add this
  whiteSpace: "nowrap", // Add this
  textAlign: "left",
  width: "100%",
};

export const SolidIconSet = () => (
  <div style={gridStyle}>
    {Object.entries(SolidIcons).map(([iconName, IconComponent]) => {
      const CurrentIcon = IconComponent.default
        ? IconComponent.default
        : IconComponent;
      return (
        <div key={iconName}>
          <Icon visual={CurrentIcon} size="md" />
          <div style={itemStyle}>{iconName + "Icon"}</div>
        </div>
      );
    })}
  </div>
);

export const StrokeIconSet = () => (
  <div style={gridStyle}>
    {Object.entries(StrokeIcons).map(([iconName, IconComponent]) => {
      const CurrentIcon = IconComponent.default
        ? IconComponent.default
        : IconComponent;
      return (
        <div key={iconName} style={{ textAlign: "center" }}>
          <Icon visual={CurrentIcon} size="md" />
          <div style={itemStyle}>{iconName + "StrokeIcon"}</div>
        </div>
      );
    })}
  </div>
);
