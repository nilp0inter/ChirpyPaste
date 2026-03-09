import {ChirpyDecoder} from "../core/chirpy-decoder.js";

const decoder = new ChirpyDecoder();
let timerInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  const elStatus = document.getElementById("status");
  const elStatusText = document.getElementById("status-text");
  const elTimer = document.getElementById("timer");
  const elBtnStop = document.getElementById("btn-stop");
  const elResult = document.getElementById("result");
  const elResultText = document.getElementById("result-text");
  const elBtnCopy = document.getElementById("btn-copy");
  const elError = document.getElementById("error");

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + sec.toString().padStart(2, "0");
  }

  function updateTimer() {
    elTimer.textContent = formatTime(decoder.getElapsed());
  }

  function setStatus(status, text) {
    elStatus.className = "status " + status;
    elStatusText.textContent = text;
  }

  function showResult(result) {
    stopTimer();
    elBtnStop.classList.add("hidden");

    // Try to paste into the active tab's focused input
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) {
        showFallback(result);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, {type: "chirpypaste-insert", text: result.text}, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          showFallback(result);
          return;
        }
        setStatus("success", "Pasted!");
        setTimeout(() => window.close(), 1000);
      });
    });
  }

  function showFallback(result) {
    setStatus("success", "Decoded!");
    elResult.classList.remove("hidden");
    elResultText.textContent = result.text;
    elBtnCopy.classList.remove("hidden");
  }

  function showError(msg) {
    stopTimer();
    setStatus("error", "Error");
    elBtnStop.classList.add("hidden");
    elError.classList.remove("hidden");
    elError.textContent = msg;
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Start recording immediately
  timerInterval = setInterval(updateTimer, 200);

  decoder.startListening((info) => {
    if (info.status === "receiving") {
      setStatus("receiving", "Receiving...");
    } else if (info.status === "decoding") {
      setStatus("decoding", "Decoding...");
    } else if (info.status === "timeout") {
      // handled by reject
    }
  }).then((result) => {
    showResult(result);
  }).catch((err) => {
    if (err.message !== "Cancelled") {
      showError(err.message);
    }
  });

  elBtnStop.addEventListener("click", () => {
    decoder.stopAndDecode();
  });

  elBtnCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(elResultText.textContent).then(() => {
      elBtnCopy.textContent = "Copied!";
      setTimeout(() => { elBtnCopy.textContent = "Copy to Clipboard"; }, 1500);
    });
  });

  window.addEventListener("beforeunload", () => {
    decoder.cancel();
  });
});
