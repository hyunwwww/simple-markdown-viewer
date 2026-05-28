# Work Log

## 2026-05-29

- revert: restore src/styles.css to HEAD (5eebca3) — undo session toolbar layout changes
- feat: replace theme.cfg with Catppuccin Latte (light) + Codex Monokai (dark)
- fix: align runtime theme.cfg lookup with packaged executable and resource locations
- build: copy portable theme.cfg sidecar after Windows packaging
- test: cover theme.cfg-driven colors in smoke checks

## 2026-05-10

- Created initial project agent policy in `AGENT.md`.
- Started Chrome extension implementation under `extension/` without modifying the existing Electron app.
- Added log folder ignore rules while keeping this concise log tracked.
- Added same-tab local Markdown link redirection and default base-path save/edit/delete support.
- Documented file URL access and relative-link base-path behavior in the extension README.
- Added fallback from document-relative links to the selected default base path.
- Fixed Chrome blocked-page risk by exposing viewer assets as MV3 web-accessible resources and routing local Markdown navigation through the service worker.
- Added the desktop viewer translation toggle between original-copy and theme controls, using a main-process Korean translation IPC for the preview pane.
- Hardened desktop Explorer/Open With handling by queuing file-open requests until the renderer is ready and validating second-instance delivery.
- Hardened desktop double-click handling for split Windows argv file paths without changing viewer features.
- Improved preview translation coverage by grouping text nodes with stable segment markers before falling back to per-node translation.
- Updated the Chrome extension to bundle the Markdown CSS theme collection and synchronize app/preview backgrounds with selected themes.
- Removed fixed-width body constraints from extension preview themes through the final preview safety stylesheet.
- Added desktop source-frame collapse persistence, F5 preview refresh, active-pane Ctrl+A selection, and shared Ctrl+wheel content zoom display.
