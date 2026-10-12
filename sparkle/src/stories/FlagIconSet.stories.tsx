import React from "react";

import {
  FLAG_CODES,
  FLAG_COUNTRY_NAMES,
  FlagIcon,
} from "../index_with_tw_base";

export default {
  title: "Assets/Flags",
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        component: `Catalog of the country and region flags (\`@sparkle/icons/flags\`), one tile per code. Render them through the **FlagIcon** component by code rather than importing a flag module directly.`,
      },
    },
  },
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "32px 16px",
};
const itemStyle = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

export const Flags = () => (
  <div style={gridStyle}>
    {FLAG_CODES.map((code) => (
      <div key={code}>
        <FlagIcon code={code} size="lg" />
        <div
          style={itemStyle as React.CSSProperties}
          className="text-base text-foreground"
        >
          {code}
        </div>
        <div className="text-xs text-muted-foreground">
          {FLAG_COUNTRY_NAMES[code]}
        </div>
      </div>
    ))}
  </div>
);
