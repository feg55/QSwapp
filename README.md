# Qswapp

Qswapp is a privacy-friendly browser extension that fixes text typed with the
wrong English or Russian keyboard layout.

```text
ghbdtn → привет
игыштуыы → business
```

Everything runs locally in your browser. No text, passwords, history, or
analytics are sent anywhere.

## Features

- Fix selected text from the context menu or with `Ctrl+Shift+L`
  (`Command+Shift+L` on macOS).
- Correct completed words automatically while you type.
- Fix a single typo after converting the keyboard layout.
- Preserve punctuation, capitalization, formatting, and links.
- Protect custom words and configure site allow/block lists.
- Use separate settings for manual and automatic correction.
- Switch between English/Russian UI and light/dark themes.

Qswapp works with regular inputs, text areas, and rich-text editors. Password
and other sensitive fields are ignored.

## Install

1. Clone or download this repository.
2. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this project directory.

## Use

Select text in an editable field, then choose **Fix keyboard layout** from the
context menu or use the keyboard shortcut.

Open the Qswapp icon to correct the current selection, enable automatic
correction, or adjust quick settings. Automatic correction requests optional
site access only when you enable it.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm test
```

Run browser tests with:

```bash
npm run test:e2e
```

Set `QSWAPP_BROWSER` to a compatible browser executable if one is not detected
automatically.

## Privacy and license

See the [Privacy Policy](PRIVACY.md) for data-handling details.

Qswapp is available under the [MIT License](LICENSE). Embedded frequency data
has separate attribution in [Third-Party Notices](THIRD_PARTY_NOTICES.md).
