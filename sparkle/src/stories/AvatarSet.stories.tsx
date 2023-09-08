import React from "react";

import { Avatar } from "../index_with_tw_base";

export default {
  title: "Assets/DroidAvatarSet",
};

const avatarUrlList = {
  "Droid_Black_1.jpg": "/static/droidavatar/Droid_Black_1.jpg",
  "Droid_Black_2.jpg": "/static/droidavatar/Droid_Black_2.jpg",
  "Droid_Black_3.jpg": "/static/droidavatar/Droid_Black_3.jpg",
  "Droid_Black_4.jpg": "/static/droidavatar/Droid_Black_4.jpg",
  "Droid_Black_5.jpg": "/static/droidavatar/Droid_Black_5.jpg",
  "Droid_Black_6.jpg": "/static/droidavatar/Droid_Black_6.jpg",
  "Droid_Black_7.jpg": "/static/droidavatar/Droid_Black_7.jpg",
  "Droid_Black_8.jpg": "/static/droidavatar/Droid_Black_8.jpg",
  "Droid_Cream_1.jpg": "/static/droidavatar/Droid_Cream_1.jpg",
  "Droid_Cream_2.jpg": "/static/droidavatar/Droid_Cream_2.jpg",
  "Droid_Cream_3.jpg": "/static/droidavatar/Droid_Cream_3.jpg",
  "Droid_Cream_4.jpg": "/static/droidavatar/Droid_Cream_4.jpg",
  "Droid_Cream_5.jpg": "/static/droidavatar/Droid_Cream_5.jpg",
  "Droid_Cream_6.jpg": "/static/droidavatar/Droid_Cream_6.jpg",
  "Droid_Cream_7.jpg": "/static/droidavatar/Droid_Cream_7.jpg",
  "Droid_Cream_8.jpg": "/static/droidavatar/Droid_Cream_8.jpg",
  "Droid_Green_1.jpg": "/static/droidavatar/Droid_Green_1.jpg",
  "Droid_Green_2.jpg": "/static/droidavatar/Droid_Green_2.jpg",
  "Droid_Green_3.jpg": "/static/droidavatar/Droid_Green_3.jpg",
  "Droid_Green_4.jpg": "/static/droidavatar/Droid_Green_4.jpg",
  "Droid_Green_5.jpg": "/static/droidavatar/Droid_Green_5.jpg",
  "Droid_Green_6.jpg": "/static/droidavatar/Droid_Green_6.jpg",
  "Droid_Green_7.jpg": "/static/droidavatar/Droid_Green_7.jpg",
  "Droid_Green_8.jpg": "/static/droidavatar/Droid_Green_8.jpg",
  "Droid_Indigo_1.jpg": "/static/droidavatar/Droid_Indigo_1.jpg",
  "Droid_Indigo_2.jpg": "/static/droidavatar/Droid_Indigo_2.jpg",
  "Droid_Indigo_3.jpg": "/static/droidavatar/Droid_Indigo_3.jpg",
  "Droid_Indigo_4.jpg": "/static/droidavatar/Droid_Indigo_4.jpg",
  "Droid_Indigo_5.jpg": "/static/droidavatar/Droid_Indigo_5.jpg",
  "Droid_Indigo_6.jpg": "/static/droidavatar/Droid_Indigo_6.jpg",
  "Droid_Indigo_7.jpg": "/static/droidavatar/Droid_Indigo_7.jpg",
  "Droid_Indigo_8.jpg": "/static/droidavatar/Droid_Indigo_8.jpg",
  "Droid_Lime_1.jpg": "/static/droidavatar/Droid_Lime_1.jpg",
  "Droid_Lime_2.jpg": "/static/droidavatar/Droid_Lime_2.jpg",
  "Droid_Lime_3.jpg": "/static/droidavatar/Droid_Lime_3.jpg",
  "Droid_Lime_4.jpg": "/static/droidavatar/Droid_Lime_4.jpg",
  "Droid_Lime_5.jpg": "/static/droidavatar/Droid_Lime_5.jpg",
  "Droid_Lime_6.jpg": "/static/droidavatar/Droid_Lime_6.jpg",
  "Droid_Lime_7.jpg": "/static/droidavatar/Droid_Lime_7.jpg",
  "Droid_Lime_8.jpg": "/static/droidavatar/Droid_Lime_8.jpg",
  "Droid_Orange_1.jpg": "/static/droidavatar/Droid_Orange_1.jpg",
  "Droid_Orange_2.jpg": "/static/droidavatar/Droid_Orange_2.jpg",
  "Droid_Orange_3.jpg": "/static/droidavatar/Droid_Orange_3.jpg",
  "Droid_Orange_4.jpg": "/static/droidavatar/Droid_Orange_4.jpg",
  "Droid_Orange_5.jpg": "/static/droidavatar/Droid_Orange_5.jpg",
  "Droid_Orange_6.jpg": "/static/droidavatar/Droid_Orange_6.jpg",
  "Droid_Orange_7.jpg": "/static/droidavatar/Droid_Orange_7.jpg",
  "Droid_Orange_8.jpg": "/static/droidavatar/Droid_Orange_8.jpg",
  "Droid_Pink_1.jpg": "/static/droidavatar/Droid_Pink_1.jpg",
  "Droid_Pink_2.jpg": "/static/droidavatar/Droid_Pink_2.jpg",
  "Droid_Pink_3.jpg": "/static/droidavatar/Droid_Pink_3.jpg",
  "Droid_Pink_4.jpg": "/static/droidavatar/Droid_Pink_4.jpg",
  "Droid_Pink_5.jpg": "/static/droidavatar/Droid_Pink_5.jpg",
  "Droid_Pink_6.jpg": "/static/droidavatar/Droid_Pink_6.jpg",
  "Droid_Pink_7.jpg": "/static/droidavatar/Droid_Pink_7.jpg",
  "Droid_Pink_8.jpg": "/static/droidavatar/Droid_Pink_8.jpg",
  "Droid_Purple_1.jpg": "/static/droidavatar/Droid_Purple_1.jpg",
  "Droid_Purple_2.jpg": "/static/droidavatar/Droid_Purple_2.jpg",
  "Droid_Purple_3.jpg": "/static/droidavatar/Droid_Purple_3.jpg",
  "Droid_Purple_4.jpg": "/static/droidavatar/Droid_Purple_4.jpg",
  "Droid_Purple_5.jpg": "/static/droidavatar/Droid_Purple_5.jpg",
  "Droid_Purple_6.jpg": "/static/droidavatar/Droid_Purple_6.jpg",
  "Droid_Purple_7.jpg": "/static/droidavatar/Droid_Purple_7.jpg",
  "Droid_Purple_8.jpg": "/static/droidavatar/Droid_Purple_8.jpg",
  "Droid_Red_1.jpg": "/static/droidavatar/Droid_Red_1.jpg",
  "Droid_Red_2.jpg": "/static/droidavatar/Droid_Red_2.jpg",
  "Droid_Red_3.jpg": "/static/droidavatar/Droid_Red_3.jpg",
  "Droid_Red_4.jpg": "/static/droidavatar/Droid_Red_4.jpg",
  "Droid_Red_5.jpg": "/static/droidavatar/Droid_Red_5.jpg",
  "Droid_Red_6.jpg": "/static/droidavatar/Droid_Red_6.jpg",
  "Droid_Red_7.jpg": "/static/droidavatar/Droid_Red_7.jpg",
  "Droid_Red_8.jpg": "/static/droidavatar/Droid_Red_8.jpg",
  "Droid_Sky_1.jpg": "/static/droidavatar/Droid_Sky_1.jpg",
  "Droid_Sky_2.jpg": "/static/droidavatar/Droid_Sky_2.jpg",
  "Droid_Sky_3.jpg": "/static/droidavatar/Droid_Sky_3.jpg",
  "Droid_Sky_4.jpg": "/static/droidavatar/Droid_Sky_4.jpg",
  "Droid_Sky_5.jpg": "/static/droidavatar/Droid_Sky_5.jpg",
  "Droid_Sky_6.jpg": "/static/droidavatar/Droid_Sky_6.jpg",
  "Droid_Sky_7.jpg": "/static/droidavatar/Droid_Sky_7.jpg",
  "Droid_Sky_8.jpg": "/static/droidavatar/Droid_Sky_8.jpg",
  "Droid_Teal_1.jpg": "/static/droidavatar/Droid_Teal_1.jpg",
  "Droid_Teal_2.jpg": "/static/droidavatar/Droid_Teal_2.jpg",
  "Droid_Teal_3.jpg": "/static/droidavatar/Droid_Teal_3.jpg",
  "Droid_Teal_4.jpg": "/static/droidavatar/Droid_Teal_4.jpg",
  "Droid_Teal_5.jpg": "/static/droidavatar/Droid_Teal_5.jpg",
  "Droid_Teal_6.jpg": "/static/droidavatar/Droid_Teal_6.jpg",
  "Droid_Teal_7.jpg": "/static/droidavatar/Droid_Teal_7.jpg",
  "Droid_Teal_8.jpg": "/static/droidavatar/Droid_Teal_8.jpg",
  "Droid_Yellow_1.jpg": "/static/droidavatar/Droid_Yellow_1.jpg",
  "Droid_Yellow_2.jpg": "/static/droidavatar/Droid_Yellow_2.jpg",
  "Droid_Yellow_3.jpg": "/static/droidavatar/Droid_Yellow_3.jpg",
  "Droid_Yellow_4.jpg": "/static/droidavatar/Droid_Yellow_4.jpg",
  "Droid_Yellow_5.jpg": "/static/droidavatar/Droid_Yellow_5.jpg",
  "Droid_Yellow_6.jpg": "/static/droidavatar/Droid_Yellow_6.jpg",
  "Droid_Yellow_7.jpg": "/static/droidavatar/Droid_Yellow_7.jpg",
  "Droid_Yellow_8.jpg": "/static/droidavatar/Droid_Yellow_8.jpg",
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

export const DroidAvatarSet = () => (
  <div style={gridStyle}>
    {Object.entries(avatarUrlList).map(([filename, url]) => {
      return (
        <div key={filename} style={itemStyle as React.CSSProperties}>
          <Avatar visual={url} size="md" />
          <div className="s-text-xs">{url}</div>
        </div>
      );
    })}
  </div>
);
