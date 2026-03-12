let lastFocusedElement = null;
let pendingInsert = null;

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

function insertText(el, text, sendEnter) {
  el.focus();
  el.select();
  document.execCommand("insertText", false, text);

  if (sendEnter) {
    el.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
    el.dispatchEvent(new KeyboardEvent("keypress", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
    el.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
    if (el.form) el.form.requestSubmit();
  }
}

document.addEventListener("focusin", (e) => {
  if (isTextInput(e.target)) {
    lastFocusedElement = e.target;

    if (pendingInsert) {
      const { text, sendEnter } = pendingInsert;
      pendingInsert = null;
      insertText(e.target, text, sendEnter);
    }
  }
}, true);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "feskpaste-insert") return;

  const el = lastFocusedElement;

  if (!el || !document.body.contains(el)) {
    sendResponse({success: false, reason: "no-input"});
    return;
  }

  // Store as pending — insertion happens when focus returns to the element
  pendingInsert = { text: msg.text, sendEnter: msg.sendEnter };

  // Also try immediate insertion (works in Firefox where focus isn't blocked)
  try {
    insertText(el, msg.text, msg.sendEnter);
    pendingInsert = null;
  } catch (e) {
    // Deferred insertion will handle it
  }

  sendResponse({success: true});
});
