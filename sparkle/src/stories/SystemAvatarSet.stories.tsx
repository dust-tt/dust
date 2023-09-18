import React from "react";

import { Avatar } from "../index_with_tw_base";

export default {
  title: "Assets/SystemAvatarSet",
};

const avatarUrlList = {
  "dust_avatar_full.png":
    "https://dust.tt/static/systemavatar/dust_avatar_full.png",
  "grammar_geek_full.png":
    "https://dust.tt/static/systemavatar/grammar_geek_full.png",
  "drive_avatar_full.png":
    "https://dust.tt/static/systemavatar/drive_avatar_full.png",
  "github_avatar_full.png":
    "https://dust.tt/static/systemavatar/github_avatar_full.png",
  "notion_avatar_full.png":
    "https://dust.tt/static/systemavatar/notion_avatar_full.png",
  "slack_avatar_full.png":
    "https://dust.tt/static/systemavatar/slack_avatar_full.png",
  "gpt4_avatar_full.png":
    "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
  "gpt3_avatar_full.png":
    "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
  "claude_avatar_full.png":
    "https://dust.tt/static/systemavatar/claude_avatar_full.png",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
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

export const SystemAvatarSet = () => (
  <>
    <div className="s-py-4 s-text-base">
      url is{" "}
      <span className="s-font-bold">
        "https://dust.tt/static/droidavatar/filename"
      </span>
    </div>
    <div style={gridStyle}>
      {Object.entries(avatarUrlList).map(([filename, url]) => {
        return (
          <div key={filename} style={itemStyle as React.CSSProperties}>
            <Avatar visual={url} size="md" />
            <div className="s-overflow-hidden s-text-ellipsis s-text-xs">
              {filename}
            </div>
          </div>
        );
      })}
    </div>
  </>
);
