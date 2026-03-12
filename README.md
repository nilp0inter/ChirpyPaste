# FESKPaste

Browser extension for Firefox and Chromium that decodes [FESK](https://www.sensorwatch.net/) audio transmissions from a Sensor Watch and pastes the decoded data into text fields.

## How it works

1. Focus a text input on any web page
2. Press **F9** (or click the extension icon)
3. The popup opens and immediately starts recording from your microphone
4. Play a FESK transmission from your Sensor Watch
5. The extension auto-detects the end of the message, decodes it, pastes the text into the input field, and closes

You can also click **Abort** to manually stop recording and decode whatever was captured.

## Settings

Right-click the extension icon and select **Preferences** (Firefox) or go to `chrome://extensions` and click **Options** (Chrome).

- **Modulation mode** — Hybrid (4FSK + BFSK), 4FSK only, or BFSK only
- **Timeout** — Seconds until auto-stop (10–120, default 30)
- **Paste to input** — Automatically paste decoded text into the focused field
- **Send Enter** — Submit the form after pasting
- **Auto-copy** — Copy decoded text to clipboard
- **Auto-close** — Close the popup after decode
- **Debug** — Show raw symbol data in the popup
- **Test Microphone** — Verify mic access and trigger the permission prompt

## Install from release

1. Download the latest release zip for your browser from the [Releases](../../releases) page
2. **Chrome/Chromium:** Go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the unzipped folder
3. **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select `manifest.json` from the unzipped folder

## Build from source

Requires Node.js 18+.

```sh
npm install
node build.js --target chrome    # or firefox
```

Output goes to `dist/chrome/` or `dist/firefox/`. Load the output folder as an unpacked extension.

### Build flags

- `--prod` — Minify, no sourcemaps
- `--target chrome|firefox` — Build for a specific browser (default: both)
- `--watch` — Watch mode for development

## License

MIT — see [LICENSE.md](LICENSE.md)
