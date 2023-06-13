import { embed } from "../../lib/connect";
const browser = require("webextension-polyfill");

console.log("background.js loaded");
/*
browser.contextMenus.create({
  id: "highlight-dust",
  title: "Search text - Dust",
  contexts: ["selection"]
})
*/

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "close_tab") {
    browser.tabs.remove(sender.tab.id);
  }
  // upsert document from doc transfer
  else if (message.type === "doc_transfer") {
    embed(message.post, message.ds).then((res) => {
      // send message back to tab
      browser.tabs.sendMessage(sender.tab.id, {
        type: "doc_transfer_complete",
      });
    });
  }
});
/*
function search(query, tabId, url)
{
  let msg = {
    type: "send_search_results",
    results: []
  }
  helpers.search_ext(query).then(
    (res) => {
      console.log(res);
      msg.results = res.documents;
      browser.tabs.sendMessage(tabId, msg);
    }
  )
}

browser.runtime.onMessage.addListener(
  (message, sender) => {
    console.log(message);
    if (message.type == "doc_transfer")
    {
      let post = message.post;
      helpers.embed(message.post, message.post.url);
    }
    else if (message.type == "search")
    {
      search(message.query, sender.tab.id, message.url);
    }
  }
)

browser.contextMenus.onClicked.addListener(function(info, tab) {
  switch (info.menuItemId) {
    case "highlight-dust":
        let msg = {
            type: "send_search_results",
            results: []
          }
        search(info.selectionText).then(
            (res) => {
                console.log(res);
                msg.results = res.documents;
                browser.tabs.sendMessage(tab.id, msg);
            }
        ) 
  }
})

/*
let cookieVals = ["next-auth.session-token", "next-auth.csrf-token", "next-auth.callback-url"];
let cookiePromises = [];
let cookies = Promise.all(cookieVals.map((val) =>
  browser.cookies.get({
    url: "http://localhost:3000",
    name: val
  })
))

cookies.then((res) => {
  console.log(res);
})*/
