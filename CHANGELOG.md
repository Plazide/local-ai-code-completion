# Change Log

All notable changes to the "local-ai-code-completion" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [1.1.0] - 2023-12-16

### Added

- Options for changing model, temperature and top_p parameters. Thanks to [@Entaigner](https://github.com/Entaigner) for adding this.

## [1.0.2] - 2023-10-25

### Changed

- Switched model to codellama:7b-code-q4_K_S from codellama:7b-code. This noticeably increases generation speed.

### Fixed

- Ollama server seemingly not starting when triggering generation for the first time.

---

## [1.0.1] - 2023-10-23

### Added

- Additional usage instructions in README.

### Fixed

- Escape key locked to abort generation, causing other escape key functions, such as closing intellisense, to not work.
- Cancel button in progress notification not working.

---

## [1.0.0] - 2023-10-23

- Initial release
