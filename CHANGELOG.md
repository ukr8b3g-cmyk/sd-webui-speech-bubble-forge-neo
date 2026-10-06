# Changelog

## Maintenance - 2026-10-06

- Keep newer edits and drafts unsaved when a previous Save Layout request finishes; ignore responses for switched or reloaded documents and prevent overlapping saves.
- Report autosave storage failures instead of success; keep the editor open and warn before native unload. Failed drafts cannot silently switch to a new standalone document.
- Reject non-object Layout/Export/Presets requests with HTTP 400. Missing, null or empty layout input cannot replace a saved file; explicit empty objects remain supported.
- Restore overlap/radiant decorations in the Pillow compatibility renderer without changing Canvas export.
- Add save-integrity regression tests and refresh the editor HTML cache key. No schema, asset or mandatory dependency changes.

## [0.5.0] - Unreleased

### Added

- Layer-based Speech Bubble, Text, SFX, Comic Stamp, Frame, and Emphasis Lines editing
- Standalone local-image editing and per-image layout storage
- User Presets for PNG and static WebP assets
- PNG, JPEG, WebP, and transparent Overlay PNG export
- Local Self Diagnostics

### Changed

- Export uses the Editor Canvas as the visual source and sends multipart binary data
- Settings are organized into User Presets, Export & Saving, Editor & Layout, and Cache & Diagnostics
- Vertical text uses grapheme-aware placement shared by Canvas and Pillow rendering

### Fixed

- Editor window reuse, reconnect, focus, and duplicate-launch handling
- User Preset style previews, replacement, rename, and retained asset references
- Export naming, dated folders, generation backups, and source-image overwrite prevention

The detailed development record is retained in [`docs/CHANGELOG_0.5.0.md`](docs/CHANGELOG_0.5.0.md). The release date remains unset until tag or Release publication is confirmed.
