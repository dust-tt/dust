import "../../assets/styles/temp.css";

var { Readability } = require("@mozilla/readability");
const browser = require("webextension-polyfill");
//import "../../assets/styles/tailwind.css"

export function parsePage(doc, check_readable = true) {
  console.log("Parsing page...");
  let parsedDoc = new Readability(doc.cloneNode(true)).parse();
  return {
    title: parsedDoc.title,
    body: parsedDoc.textContent,
    excerpt: parsedDoc.excerpt,
  };
}

let parsedPage;
let currUrl = window.location.href;

let indexing = document.createElement("p");
indexing.innerHTML = "Indexing...";
indexing.style =
  "position: absolute; top: 20px; right: 20px; z-index: 199999; background: white; padding: 20px; text-align: center; display: none; color: black;";
document.body.appendChild(indexing);

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "doc_request") {
    console.log("Message received!");
    indexing.style.display = "block";
    parsedPage = parsedPage || parsePage(document, false);
    parsedPage.url = currUrl;
    // send content back
    console.log("Sending message back...");
    browser.runtime.sendMessage({
      type: "doc_transfer",
      post: parsedPage,
      ds: message.ds,
    });
  } 
  /*else if (message.type === "send_search_results") {
    if (overlay.style.display == "block") {
      toggleOverlay();
    }
    let ulList = document.createElement("ul");
    message.results.forEach((item) => createResult(item, ulList));
    modify.appendChild(ulList);
    toggleOverlay();
    */
  else if (message.type === "doc_transfer_complete") {
    indexing.style.display = "none";
  }
});

let server = `https://dust.tt/w/`;
browser.storage.local.get("onboarding").then((res) => {
  if (res.onboarding) {
    console.log("onboarding");
    if (currUrl.includes(server) && !currUrl.includes("keys")) {
      let w_id = currUrl.split(server)[1].split("/")[0]; // extract w_id;
      browser.storage.local.set({ w_id, onboarding: false });
    }
  }
});

// create wrappper div for overlay
/*
let wrapper = document.createElement("div");
wrapper.classList.add("dust");

let overlay = document.createElement("div");
//overlay.classList.add("fixed", "p-5", "top-5", "bg-white", "right-5", "w-96", "rounded-lg", "shadow", "text-gray-800", "z-50")
wrapper.appendChild(overlay);
let h1 = document.createElement("h1");
h1.textContent = "Search results";
overlay.appendChild(h1)
overlay.style["min-height"] = "300px"; 
let modify = document.createElement("div");
let toggleBtn = document.createElement("button");
toggleBtn.textContent = "×";
toggleBtn.addEventListener("click", toggleOverlay);


overlay.id = "dust-overlay";
overlay.style.display = "none";
//overlay.appendChild(toggleBtn);
overlay.appendChild(modify);

document.body.appendChild(wrapper);

function toggleOverlay()
{
  if (overlay.style.display == "block")
  {
    modify.innerHTML = "";
    overlay.style.display = "none";
  }
  else {
    overlay.style.display = "block";
  }
}

function createResult(item, cont) {
  let li = document.createElement("li");
  li.classList.add("p-1")
  let a = document.createElement("a");
  a.textContent = item.document_id, a.href = `http://localhost:3000/w/caccbb5c3a/ds/ra/upsert?documentId=${item.document_id}`;
  a.classList.add("font-light", "text-gray-800", "text-base", "break-words");
  li.appendChild(a);
  console.log(a.classList);
  /*
  if ("excerpt" in item) {
    let p = document.createElement("p");
    p.textContent = item.excerpt;
    li.appendChild(p);
  }
  cont.appendChild(li);
}
*/
