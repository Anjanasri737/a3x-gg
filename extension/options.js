const input = document.getElementById("base");
chrome.storage.local.get(["gharpayy.base"], (v) => {
  input.value = v["gharpayy.base"] ?? "";
});
document.getElementById("save").onclick = () => {
  const value = input.value.trim().replace(/\/$/, "");
  chrome.storage.local.set({ "gharpayy.base": value }, () => {
    document.getElementById("msg").textContent = "Saved. Reload WhatsApp Web.";
  });
};
