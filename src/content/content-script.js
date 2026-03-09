let lastFocusedElement = null;

function isTextInput(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return ["text", "search", "url", "email", "tel", "password", "number"].includes(type);
  }
  return false;
}

document.addEventListener("focusin", (e) => {
  if (isTextInput(e.target)) {
    lastFocusedElement = e.target;
  }
}, true);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "chirpypaste-insert") return;

  const text = msg.text;
  const el = lastFocusedElement;

  if (!el || !document.body.contains(el)) {
    sendResponse({success: false, reason: "no-input"});
    return;
  }

  try {
    el.focus();

    if (el.isContentEditable) {
      document.execCommand("insertText", false, text);
    } else {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const before = el.value.substring(0, start);
      const after = el.value.substring(end);
      el.value = before + text + after;
      el.selectionStart = el.selectionEnd = start + text.length;

      el.dispatchEvent(new Event("input", {bubbles: true}));
      el.dispatchEvent(new Event("change", {bubbles: true}));
    }

    sendResponse({success: true});
  } catch (err) {
    sendResponse({success: false, reason: err.message});
  }
});
