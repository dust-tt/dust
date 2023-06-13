const browser = require("webextension-polyfill");

export async function checkAPI() {
  // check if w_id exists and if we can query workspace
  let w_id = browser.storage.local.get("w_id");
  if (w_id) {
    let req = await execAuthedReq("", "GET");
    if (req.ok) {
      return true;
    }
  }
  return false;
}
async function execAuthedReq(endpoint, method, data) {
  let headers = {
    "User-Agent": "dust/1.0",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/json",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };

  let w_id = (await browser.storage.local.get("w_id")).w_id;
  let reqInfo = {
    method: method,
    credentials: "include",
    headers: headers,
    mode: "cors",
  };
  if (data) {
    reqInfo.body = JSON.stringify(data);
  }

  let res = await fetch(
    `https://dust.tt/api/w/${w_id}/data_sources/${endpoint}`,
    reqInfo
  );
  if (res.ok) return res;
  else throw "Error: " + res.status;
}

export async function embed(content, ds) {
  let body = {
    text: content.body,
    tags: [],
  };
  return execAuthedReq(
    `${ds}/documents/${encodeURIComponent(content.url)}`,
    "POST",
    body
  );
}

export async function getDS() {
  let dataSources = (await (await execAuthedReq("", "GET")).json()).dataSources;
  return dataSources.filter((ds) => ds.userUpsertable);
}
/*
export function search(query)
{
  return execAuthedReq(`ra/search?query=${encodeURIComponent(query)}&full_text=false&top_k=25`, "GET");
}
*/
