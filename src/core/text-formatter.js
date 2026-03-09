import {decodeDateTime, dateToIso} from "../lib/content-shared.js";
import {toBase64} from "../lib/base64.js";

const activities = ["BIKE", "WALK", "RUN", "DANCE", "YOGA", "CROSSFIT", "SWIM",
  "ELLIPTICAL", "GYM", "ROW", "SOCCER", "FOOTBALL", "BALLGAME", "SKI",
];

const profiles = [
  "static hardware correction",
  "static correction with dithering",
  "datasheet quadratic correction",
  "cubic correction conservative",
  "cubic correction finetuned",
];

function secsToDuration(val) {
  let secs = val % 60;
  val -= secs;
  val /= 60;
  let mins = val % 60;
  val -= mins;
  let hours = val / 60;
  let res = mins.toString().padStart(2, "0") + ":" + secs.toString().padStart(2, "0");
  if (hours == 0) return res;
  res = hours.toString() + ":" + res;
  return res;
}

function formatBytes(bytes) {
  // Try activity format
  if (bytes.length > 2 && bytes[0] == 0x27 && bytes[1] == 0x00) {
    return formatActivity(bytes);
  }
  // Try nanosec.ini format
  if (bytes.length >= 20 && bytes[0] == 0xc0 && bytes[1] == 0x00) {
    return formatNanosecIni(bytes);
  }
  // Try ASCII
  if (isAscii(bytes)) {
    return { text: bytesToAscii(bytes), format: "ascii" };
  }
  // Fallback: base64
  return { text: toBase64(bytes), format: "base64" };
}

function isAscii(bytes) {
  for (const b of bytes)
    if (b == 0 || b > 127) return false;
  return true;
}

function bytesToAscii(bytes) {
  let str = "";
  for (const b of bytes)
    str += String.fromCodePoint(b);
  return str;
}

function formatActivity(bytes) {
  const itmLen = 9;
  let tableTxt = "time\tactivity_code\tactivity_name\ttotal_duration\tpause_duration\n";
  for (let ix = 2; ix < bytes.length; ix += itmLen) {
    const itmBytes = bytes.slice(ix, ix + itmLen);
    const start = decodeDateTime(itmBytes);
    const totalSec = itmBytes[4] * 256 + itmBytes[5];
    const pauseSec = itmBytes[6] * 256 + itmBytes[7];
    const typeNum = itmBytes[8];
    const type = typeNum < activities.length ? activities[typeNum] : "UNKNOWN";
    tableTxt += dateToIso(start) + "\t" + typeNum + "\t" + type + "\t";
    tableTxt += secsToDuration(totalSec) + "\t" + secsToDuration(pauseSec);
    tableTxt += "\n";
  }
  return { text: tableTxt, format: "activity" };
}

function formatNanosecIni(bytes) {
  const d = bytes.slice(2);
  const correctionProfile = d[0];
  const correctionProfileStr = correctionProfile < profiles.length ? profiles[correctionProfile] : "unknown";
  const freqCorrection = (d[3] << 8) + d[2];
  const centerTemperature = (d[5] << 8) + d[4];
  const quadraticTempCo = (d[7] << 8) + d[6];
  const cubicTempCo = (d[9] << 8) + d[8];
  const correctionCadence = d[10];
  const lastCurrTimeUnix = (d[15] << 24) + (d[14] << 16) + (d[13] << 8) + d[12];
  const lastCorrectionTime = new Date(lastCurrTimeUnix * 1000);
  const annualAgingPPA = (d[17] << 8) + d[16];

  let txt = "";
  txt += "Correction profile:     " + correctionProfile + " (" + correctionProfileStr + ")\n";
  txt += "Frequency correction:   " + (freqCorrection / 100).toFixed(2) + "\n";
  txt += "Center temperature:     " + (centerTemperature / 100).toFixed(2) + "\n";
  txt += "Quadratic temp coeff:  -" + quadraticTempCo + "e-5\n";
  txt += "Cubic temp coeff:       " + cubicTempCo + "e-7\n";
  txt += "Correction cadence:     " + correctionCadence + "\n";
  txt += "Last correction time:   " + dateToIso(lastCorrectionTime) + "\n";
  txt += "Annual aging:           " + (annualAgingPPA / 100).toFixed(2) + " PPA\n";

  return { text: txt, format: "nanosec" };
}

export {formatBytes};
