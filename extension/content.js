// Gharpayy CRM side panel injected into real WhatsApp Web.
// It docks the CRM companion beside the chat list and tells it which chat is open.

const DEFAULT_BASE = "https://id-preview--06b4cacb-c37a-4964-9c2a-f87ce6e794c2.lovable.app";
const WIDTH_KEY = "gharpayy.panel.width";

let baseUrl = DEFAULT_BASE;
let frame = null;
let lastChat = "";

function build() {
  if (frame) return frame;
  const dock = document.createElement("div");
  dock.id = "gharpayy-dock";
  dock.innerHTML = `
    <div id="gharpayy-bar">
      <span>Gharpayy CRM</span>
      <button id="gharpayy-close" title="Hide">×</button>
    </div>
    <iframe id="gharpayy-frame" src="${baseUrl}/companion?embed=1" allow="clipboard-read; clipboard-write"></iframe>
    <div id="gharpayy-grip"></div>`;
  document.body.appendChild(dock);
  document.documentElement.classList.add("gharpayy-docked");

  dock.querySelector("#gharpayy-close").onclick = () => toggle(false);

  // drag to resize
  const grip = dock.querySelector("#gharpayy-grip");
  let dragging = false;
  grip.addEventListener("mousedown", () => (dragging = true));
  window.addEventListener("mouseup", () => (dragging = false));
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.min(720, Math.max(320, window.innerWidth - e.clientX));
    document.documentElement.style.setProperty("--gharpayy-w", w + "px");
    chrome.storage.local.set({ [WIDTH_KEY]: w });
  });

  frame = dock.querySelector("#gharpayy-frame");
  return frame;
}

function toggle(on) {
  const dock = document.getElementById("gharpayy-dock");
  if (!dock) return build();
  const show = on ?? dock.style.display === "none";
  dock.style.display = show ? "flex" : "none";
  document.documentElement.classList.toggle("gharpayy-docked", show);
}

/** Read the open conversation's title / number straight from WhatsApp's DOM. */
function activeChat() {
  const header = document.querySelector("header [title]");
  const title = header?.getAttribute("title") ?? "";
  const digits = title.replace(/\D/g, "");
  return { title, phone: digits.length >= 10 ? digits.slice(-10) : "" };
}

function pushChat() {
  if (!frame) return;
  const chat = activeChat();
  const key = chat.title + "|" + chat.phone;
  if (!chat.title || key === lastChat) return;
  lastChat = key;
  frame.contentWindow?.postMessage({ source: "gharpayy-wa", type: "active-chat", ...chat }, baseUrl);
}

chrome.storage.local.get(["gharpayy.base", WIDTH_KEY], (v) => {
  if (v["gharpayy.base"]) baseUrl = v["gharpayy.base"];
  if (v[WIDTH_KEY]) document.documentElement.style.setProperty("--gharpayy-w", v[WIDTH_KEY] + "px");
  build();
  setInterval(pushChat, 1200);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "toggle-panel") toggle();
});
