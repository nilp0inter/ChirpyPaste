import {FFT} from "../lib/fft.js";
import {ToneStencil, Demodulator, Decoder} from "../lib/chirpy-rx.js";
import {toBase64} from "../lib/base64.js";
import {formatBytes} from "./text-formatter.js";

const toneRate = 64 / 3;
const baseFreq = 2500;
const freqStep = 250;
const nFreqs = 9;
const fftSize = 512;
const TIMEOUT_MS = 30000;
const CHECK_INTERVAL_MS = 500;

class ChirpyDecoder {
  constructor() {
    this.audioCtx = null;
    this.stream = null;
    this.scriptNode = null;
    this.source = null;
    this.spectra = [];
    this.sampleRate = null;
    this.demodulator = null;
    this.fft = null;
    this.startMsec = -1;
    this.lastCheckedSpectraLen = 0;
    this.tones = [];
    this.nextToneMsec = 0;
    this.checkInterval = null;
    this.timeoutTimer = null;
    this._resolve = null;
    this._reject = null;
    this._cancelled = false;
    this._stopped = false;
    this._statusCb = null;
    this._startTime = null;
  }

  startListening(onStatusChange) {
    this._statusCb = onStatusChange;
    return new Promise(async (resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      } catch (err) {
        reject(new Error("Microphone access denied"));
        return;
      }

      this.audioCtx = new AudioContext();
      this.sampleRate = this.audioCtx.sampleRate;
      this.source = this.audioCtx.createMediaStreamSource(this.stream);

      this.fft = new FFT(fftSize, this.sampleRate);
      this.demodulator = new Demodulator({
        sampleRate: this.sampleRate,
        fftSize,
        toneRate,
        baseFreq,
        freqStep,
        nFreqs,
      });

      this.scriptNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
      this.scriptNode.onaudioprocess = (e) => this._onAudioProcess(e);
      this.source.connect(this.scriptNode);
      this.scriptNode.connect(this.audioCtx.destination);

      this._startTime = Date.now();
      this._emitStatus("listening");

      this.checkInterval = setInterval(() => this._checkForMessage(), CHECK_INTERVAL_MS);
      this.timeoutTimer = setTimeout(() => {
        if (!this._cancelled && !this._stopped) {
          this._emitStatus("timeout");
          this._cleanup();
          reject(new Error("No transmission detected (timeout)"));
        }
      }, TIMEOUT_MS);
    });
  }

  _onAudioProcess(e) {
    const inputBuffer = e.inputBuffer.getChannelData(0);
    const samplesPerFrame = fftSize;
    const numFrames = Math.floor(inputBuffer.length / samplesPerFrame);

    for (let i = 0; i < numFrames; i++) {
      const frame = new Float32Array(samplesPerFrame);
      frame.set(inputBuffer.subarray(i * samplesPerFrame, (i + 1) * samplesPerFrame));
      this.fft.forward(frame);
      this.spectra.push(new Float64Array(this.fft.spectrum));
    }
  }

  _checkForMessage() {
    if (this._cancelled || this._stopped) return;
    if (this.spectra.length <= this.lastCheckedSpectraLen) return;

    if (this.startMsec === -1) {
      this.startMsec = this.demodulator.findStartMsec(this.spectra);
      if (this.startMsec !== -1) {
        this._emitStatus("receiving");
        const toneLenMsec = 1000 / toneRate;
        this.nextToneMsec = this.startMsec + 4 * toneLenMsec;
        this.tones = [];
      }
    }

    if (this.startMsec !== -1) {
      const sampleLenMsec = fftSize / this.sampleRate * 1000;
      const maxMsec = (this.spectra.length - 2) * sampleLenMsec;
      const toneLenMsec = 1000 / toneRate;

      while (this.nextToneMsec < maxMsec) {
        const tone = this.demodulator.detecToneAt(this.spectra, this.nextToneMsec);
        if (tone === -1) break;
        this.tones.push(tone);
        this.nextToneMsec += toneLenMsec;

        // Check for EOM: 3 consecutive tone 8
        if (this.tones.length >= 3) {
          const len = this.tones.length;
          if (this.tones[len - 1] === 8 && this.tones[len - 2] === 8 && this.tones[len - 3] === 8) {
            this._onEOM();
            return;
          }
        }
      }
    }

    this.lastCheckedSpectraLen = this.spectra.length;
  }

  _onEOM() {
    this._stopped = true;
    this._emitStatus("decoding");

    const allTones = [8, 0, 8, 0, ...this.tones];
    const decoder = new Decoder(allTones);

    this._cleanup();

    const result = {
      bytes: decoder.bytes,
      base64: toBase64(decoder.bytes),
      valid: decoder.valid,
      ...formatBytes(decoder.bytes),
    };
    this._resolve(result);
  }

  stopAndDecode() {
    if (this._cancelled || this._stopped) return;
    this._stopped = true;
    this._emitStatus("decoding");

    // If we found SOM and have tones, decode them
    if (this.tones.length > 0) {
      const allTones = [8, 0, 8, 0, ...this.tones];
      const decoder = new Decoder(allTones);
      this._cleanup();
      const result = {
        bytes: decoder.bytes,
        base64: toBase64(decoder.bytes),
        valid: decoder.valid,
        ...formatBytes(decoder.bytes),
      };
      this._resolve(result);
      return;
    }

    // If no SOM found yet, try full decode on accumulated spectra
    if (this.spectra.length > 0 && this.demodulator) {
      const startMsec = this.demodulator.findStartMsec(this.spectra);
      if (startMsec !== -1) {
        const sampleLenMsec = fftSize / this.sampleRate * 1000;
        const maxMsec = (this.spectra.length - 2) * sampleLenMsec;
        const toneLenMsec = 1000 / toneRate;
        const tones = [];
        let msec = startMsec + 4 * toneLenMsec;

        while (msec < maxMsec) {
          const tone = this.demodulator.detecToneAt(this.spectra, msec);
          if (tone === -1) break;
          tones.push(tone);
          msec += toneLenMsec;
        }

        if (tones.length > 0) {
          const allTones = [8, 0, 8, 0, ...tones];
          const decoder = new Decoder(allTones);
          this._cleanup();
          const result = {
            bytes: decoder.bytes,
            base64: toBase64(decoder.bytes),
            valid: decoder.valid,
            ...formatBytes(decoder.bytes),
          };
          this._resolve(result);
          return;
        }
      }
    }

    this._cleanup();
    this._reject(new Error("No transmission detected"));
  }

  cancel() {
    if (this._cancelled || this._stopped) return;
    this._cancelled = true;
    this._cleanup();
    this._reject(new Error("Cancelled"));
  }

  _cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  _emitStatus(status) {
    if (this._statusCb) {
      this._statusCb({
        status,
        elapsed: this._startTime ? Date.now() - this._startTime : 0,
      });
    }
  }

  getElapsed() {
    return this._startTime ? Date.now() - this._startTime : 0;
  }
}

export {ChirpyDecoder};
