import React from "react";

import { Icon } from "../index_with_tw_base";
import * as PlatformIcons from "../logo/platforms";

export default {
  title: "Assets/Platform Logos",
  parameters: {
    docs: {
      description: {
        component: `Catalog of third-party platform and connector logos (\`@sparkle/logo/platforms\`) — Slack, Notion, Google Drive, GitHub, and the rest. Render them through the **Icon** component, and use these official marks when surfacing integrations rather than sourcing logos elsewhere.`,
      },
    },
  },
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

export const PlatformLogos = () => (
  <div style={gridStyle}>
    {Object.entries(PlatformIcons).map(([iconName, IconComponent]) => {
      const CurrentIcon = (
        "default" in IconComponent ? IconComponent.default : IconComponent
      ) as React.ComponentType<{ className?: string | undefined }>;
      return (
        <div key={iconName}>
          <Icon visual={CurrentIcon} size="lg" />
          <div style={itemStyle as React.CSSProperties} className="s-text-base">
            {iconName}
          </div>
        </div>
      );
    })}
  </div>
);
