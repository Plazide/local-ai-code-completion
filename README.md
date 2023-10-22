# local-code-completion README

Enable AI Assisted code completion, similar to Github Copilot, completely locally. No code leaves your machine. This has two major benefits:

- **Cost**. This extension is completely free to use.
- **Privacy**. No data is shared with third-parties, everything stays on your computer.

## Features

AI Assisted code completion.

You trigger code completion by pressing <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>. GIF is sped up.

[![usage example](./assets/example.gif)]

## Requirements

This extension requires an [Ollama](https://ollama.ai/) installation to run the language model locally.

<!-- ## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

- `myExtension.enable`: Enable/disable this extension.
- `myExtension.thing`: Set to `blah` to do something. -->

## Known Issues

- Time to start generating can be very long. This is an inherent issue to the model running locally on your computer.
- Inference is slow. Also a consequence of running the model locally, but depends on your system.

## Release Notes

### 1.0.0

Initial release.

---
