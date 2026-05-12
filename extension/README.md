# Simple Markdown Viewer Chrome Extension

## Scope

This extension is a browser-based Markdown viewer derived from the existing Electron viewer UI and renderer behavior.

It provides:

- Markdown source and rendered viewer panes.
- Dark/light app mode.
- Preview theme selection from the bundled Markdown CSS theme collection.
- App mode and preview background synchronization so the viewer pane does not keep a mismatched light/dark background.
- Outline navigation from Markdown headings.
- Markdown and HTML download instead of direct file overwrite.
- Local `.md`, `.markdown`, and `.txt` file-link redirection from `file://` pages.
- Default base paths for resolving relative Markdown links.

## Local Installation

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `C:\My Projects\.End_projects\markdown-viewer\extension`.
5. For local `file://` links, open the extension details page and enable Allow access to file URLs.

## File URL Behavior

The viewer can open absolute file URLs such as:

```text
file:///C:/My%20Projects/agent_orchestrator/debug/policy.md
```

When a local HTML page links to a Markdown file, the content script opens the link in this extension viewer if file URL access is enabled. Direct navigation to a local `.md`, `.markdown`, or `.txt` file is also redirected to the viewer in the same tab.

If Chrome shows a blocked page, reload the unpacked extension after updates and confirm that Allow access to file URLs is enabled. The extension exposes only its viewer assets for `file://` page navigation through Manifest V3 `web_accessible_resources`.

## Default Base Paths

The viewer can save, edit, and delete default base paths. Use a Windows absolute path or file URL, for example:

```text
C:\My Projects\agent_orchestrator\debug
file:///C:/My%20Projects/agent_orchestrator/debug/
```

If a document link is relative and the active document has no absolute source URL, the viewer resolves that link against the selected default base path.

## Theme Source

Bundled preview themes come from `git@github.com:hyunwwww/markdown-css-themes.git` at commit `4a01f907ed35fec6f876b0f3373b2ebc6fa4547a`.

The files are stored under `themes/markdown-css-themes/`.

`swiss.css` and `markdown4.css` include an LGPL notice from their upstream source. The repository root did not include a separate `LICENSE` file at the checked commit, and not every CSS file carries an explicit license notice, so redistribution beyond local project use should re-check licensing before publishing.
