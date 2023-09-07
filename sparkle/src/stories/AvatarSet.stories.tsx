import React from "react";

import { Avatar } from "../index_with_tw_base";

export default {
  title: "Assets/DroidAvatarSet",
};

const avatarUrlList = {
  "Droïd_Black_1.jpg": "/static/droidavatar/Droïd_Black_1.jpg",
  "Droïd_Black_2.jpg": "/static/droidavatar/Droïd_Black_2.jpg",
  "Droïd_Black_3.jpg": "/static/droidavatar/Droïd_Black_3.jpg",
  "Droïd_Black_4.jpg": "/static/droidavatar/Droïd_Black_4.jpg",
  "Droïd_Black_5.jpg": "/static/droidavatar/Droïd_Black_5.jpg",
  "Droïd_Black_6.jpg": "/static/droidavatar/Droïd_Black_6.jpg",
  "Droïd_Black_7.jpg": "/static/droidavatar/Droïd_Black_7.jpg",
  "Droïd_Black_8.jpg": "/static/droidavatar/Droïd_Black_8.jpg",
  "Droïd_Cream_1.jpg": "/static/droidavatar/Droïd_Cream_1.jpg",
  "Droïd_Cream_2.jpg": "/static/droidavatar/Droïd_Cream_2.jpg",
  "Droïd_Cream_3.jpg": "/static/droidavatar/Droïd_Cream_3.jpg",
  "Droïd_Cream_4.jpg": "/static/droidavatar/Droïd_Cream_4.jpg",
  "Droïd_Cream_5.jpg": "/static/droidavatar/Droïd_Cream_5.jpg",
  "Droïd_Cream_6.jpg": "/static/droidavatar/Droïd_Cream_6.jpg",
  "Droïd_Cream_7.jpg": "/static/droidavatar/Droïd_Cream_7.jpg",
  "Droïd_Cream_8.jpg": "/static/droidavatar/Droïd_Cream_8.jpg",
  "Droïd_Green_1.jpg": "/static/droidavatar/Droïd_Green_1.jpg",
  "Droïd_Green_2.jpg": "/static/droidavatar/Droïd_Green_2.jpg",
  "Droïd_Green_3.jpg": "/static/droidavatar/Droïd_Green_3.jpg",
  "Droïd_Green_4.jpg": "/static/droidavatar/Droïd_Green_4.jpg",
  "Droïd_Green_5.jpg": "/static/droidavatar/Droïd_Green_5.jpg",
  "Droïd_Green_6.jpg": "/static/droidavatar/Droïd_Green_6.jpg",
  "Droïd_Green_7.jpg": "/static/droidavatar/Droïd_Green_7.jpg",
  "Droïd_Green_8.jpg": "/static/droidavatar/Droïd_Green_8.jpg",
  "Droïd_Indigo_1.jpg": "/static/droidavatar/Droïd_Indigo_1.jpg",
  "Droïd_Indigo_2.jpg": "/static/droidavatar/Droïd_Indigo_2.jpg",
  "Droïd_Indigo_3.jpg": "/static/droidavatar/Droïd_Indigo_3.jpg",
  "Droïd_Indigo_4.jpg": "/static/droidavatar/Droïd_Indigo_4.jpg",
  "Droïd_Indigo_5.jpg": "/static/droidavatar/Droïd_Indigo_5.jpg",
  "Droïd_Indigo_6.jpg": "/static/droidavatar/Droïd_Indigo_6.jpg",
  "Droïd_Indigo_7.jpg": "/static/droidavatar/Droïd_Indigo_7.jpg",
  "Droïd_Indigo_8.jpg": "/static/droidavatar/Droïd_Indigo_8.jpg",
  "Droïd_Lime_1.jpg": "/static/droidavatar/Droïd_Lime_1.jpg",
  "Droïd_Lime_2.jpg": "/static/droidavatar/Droïd_Lime_2.jpg",
  "Droïd_Lime_3.jpg": "/static/droidavatar/Droïd_Lime_3.jpg",
  "Droïd_Lime_4.jpg": "/static/droidavatar/Droïd_Lime_4.jpg",
  "Droïd_Lime_5.jpg": "/static/droidavatar/Droïd_Lime_5.jpg",
  "Droïd_Lime_6.jpg": "/static/droidavatar/Droïd_Lime_6.jpg",
  "Droïd_Lime_7.jpg": "/static/droidavatar/Droïd_Lime_7.jpg",
  "Droïd_Lime_8.jpg": "/static/droidavatar/Droïd_Lime_8.jpg",
  "Droïd_Orange_1.jpg": "/static/droidavatar/Droïd_Orange_1.jpg",
  "Droïd_Orange_2.jpg": "/static/droidavatar/Droïd_Orange_2.jpg",
  "Droïd_Orange_3.jpg": "/static/droidavatar/Droïd_Orange_3.jpg",
  "Droïd_Orange_4.jpg": "/static/droidavatar/Droïd_Orange_4.jpg",
  "Droïd_Orange_5.jpg": "/static/droidavatar/Droïd_Orange_5.jpg",
  "Droïd_Orange_6.jpg": "/static/droidavatar/Droïd_Orange_6.jpg",
  "Droïd_Orange_7.jpg": "/static/droidavatar/Droïd_Orange_7.jpg",
  "Droïd_Orange_8.jpg": "/static/droidavatar/Droïd_Orange_8.jpg",
  "Droïd_Pink_1.jpg": "/static/droidavatar/Droïd_Pink_1.jpg",
  "Droïd_Pink_2.jpg": "/static/droidavatar/Droïd_Pink_2.jpg",
  "Droïd_Pink_3.jpg": "/static/droidavatar/Droïd_Pink_3.jpg",
  "Droïd_Pink_4.jpg": "/static/droidavatar/Droïd_Pink_4.jpg",
  "Droïd_Pink_5.jpg": "/static/droidavatar/Droïd_Pink_5.jpg",
  "Droïd_Pink_6.jpg": "/static/droidavatar/Droïd_Pink_6.jpg",
  "Droïd_Pink_7.jpg": "/static/droidavatar/Droïd_Pink_7.jpg",
  "Droïd_Pink_8.jpg": "/static/droidavatar/Droïd_Pink_8.jpg",
  "Droïd_Purple_1.jpg": "/static/droidavatar/Droïd_Purple_1.jpg",
  "Droïd_Purple_2.jpg": "/static/droidavatar/Droïd_Purple_2.jpg",
  "Droïd_Purple_3.jpg": "/static/droidavatar/Droïd_Purple_3.jpg",
  "Droïd_Purple_4.jpg": "/static/droidavatar/Droïd_Purple_4.jpg",
  "Droïd_Purple_5.jpg": "/static/droidavatar/Droïd_Purple_5.jpg",
  "Droïd_Purple_6.jpg": "/static/droidavatar/Droïd_Purple_6.jpg",
  "Droïd_Purple_7.jpg": "/static/droidavatar/Droïd_Purple_7.jpg",
  "Droïd_Purple_8.jpg": "/static/droidavatar/Droïd_Purple_8.jpg",
  "Droïd_Red_1.jpg": "/static/droidavatar/Droïd_Red_1.jpg",
  "Droïd_Red_2.jpg": "/static/droidavatar/Droïd_Red_2.jpg",
  "Droïd_Red_3.jpg": "/static/droidavatar/Droïd_Red_3.jpg",
  "Droïd_Red_4.jpg": "/static/droidavatar/Droïd_Red_4.jpg",
  "Droïd_Red_5.jpg": "/static/droidavatar/Droïd_Red_5.jpg",
  "Droïd_Red_6.jpg": "/static/droidavatar/Droïd_Red_6.jpg",
  "Droïd_Red_7.jpg": "/static/droidavatar/Droïd_Red_7.jpg",
  "Droïd_Red_8.jpg": "/static/droidavatar/Droïd_Red_8.jpg",
  "Droïd_Sky_1.jpg": "/static/droidavatar/Droïd_Sky_1.jpg",
  "Droïd_Sky_2.jpg": "/static/droidavatar/Droïd_Sky_2.jpg",
  "Droïd_Sky_3.jpg": "/static/droidavatar/Droïd_Sky_3.jpg",
  "Droïd_Sky_4.jpg": "/static/droidavatar/Droïd_Sky_4.jpg",
  "Droïd_Sky_5.jpg": "/static/droidavatar/Droïd_Sky_5.jpg",
  "Droïd_Sky_6.jpg": "/static/droidavatar/Droïd_Sky_6.jpg",
  "Droïd_Sky_7.jpg": "/static/droidavatar/Droïd_Sky_7.jpg",
  "Droïd_Sky_8.jpg": "/static/droidavatar/Droïd_Sky_8.jpg",
  "Droïd_Teal_1.jpg": "/static/droidavatar/Droïd_Teal_1.jpg",
  "Droïd_Teal_2.jpg": "/static/droidavatar/Droïd_Teal_2.jpg",
  "Droïd_Teal_3.jpg": "/static/droidavatar/Droïd_Teal_3.jpg",
  "Droïd_Teal_4.jpg": "/static/droidavatar/Droïd_Teal_4.jpg",
  "Droïd_Teal_5.jpg": "/static/droidavatar/Droïd_Teal_5.jpg",
  "Droïd_Teal_6.jpg": "/static/droidavatar/Droïd_Teal_6.jpg",
  "Droïd_Teal_7.jpg": "/static/droidavatar/Droïd_Teal_7.jpg",
  "Droïd_Teal_8.jpg": "/static/droidavatar/Droïd_Teal_8.jpg",
  "Droïd_Yellow_1.jpg": "/static/droidavatar/Droïd_Yellow_1.jpg",
  "Droïd_Yellow_2.jpg": "/static/droidavatar/Droïd_Yellow_2.jpg",
  "Droïd_Yellow_3.jpg": "/static/droidavatar/Droïd_Yellow_3.jpg",
  "Droïd_Yellow_4.jpg": "/static/droidavatar/Droïd_Yellow_4.jpg",
  "Droïd_Yellow_5.jpg": "/static/droidavatar/Droïd_Yellow_5.jpg",
  "Droïd_Yellow_6.jpg": "/static/droidavatar/Droïd_Yellow_6.jpg",
  "Droïd_Yellow_7.jpg": "/static/droidavatar/Droïd_Yellow_7.jpg",
  "Droïd_Yellow_8.jpg": "/static/droidavatar/Droïd_Yellow_8.jpg",
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
