# Image Analysis UI

Dedicated interface for submitting a single image and viewing structured + raw analysis results. This supersedes the former chat-style input on the image analysis route.

## Current User Flow
1. Drag & Drop or click the drop zone to open the file picker.
2. Supported file validated (extension + size). If invalid, a centered alert appears.
3. A thumbnail preview loads with a skeleton until fully decoded.
4. User clicks "Run analysis" to invoke the backend (same RAG/chat pipeline under the hood).
5. Result is displayed in a right-hand panel with two tabs: Formatted Fields & Raw JSON.
6. User can copy or download the JSON via icon-only actions.
7. User may Change Image (reopen picker) or Remove Image (reset + navigate away).

## Components Overview

| Component | Purpose |
|-----------|---------|
| `ImageAnalysisInput.tsx` | File selection, drag/drop, preview, validation, analysis invocation, local loading overlay. |
| `AnalysisResultPanel.tsx` | Tabbed display (Formatted key-value list + Raw JSON), copy + download actions. |
| `ToastHost.tsx` | Centered stacked alerts (error/info/success/warning) replacing small corner toasts. |
| `ImageAnalysisPage.tsx` | Two-column layout page container, manages state and wires callbacks. |

## Layout
Two-column responsive grid: left column houses upload & preview; right column shows results (or placeholder when empty). Header redesigned with subtle icon & gradient styling (see associated page CSS).

## Supported File Types
Whitelisted extensions (case-insensitive):

```
.jpg .jpeg .jpe .jif .jfi .jfif
.png .bmp
.heic .heif
```

Note: `.webp` and animated formats (e.g., GIF) are intentionally excluded. Selection dialog is restricted via the explicit `accept` attribute, and dropped files outside the whitelist trigger an error alert.

## Validation Rules
- Max file size: 2 MB.
- Extension must be in whitelist (checked from filename, not MIME alone).
- Preview skeleton displayed until the image fully loads; error message if preview fails.
- Object URLs revoked on reset + unmount to prevent leaks.

## Analysis Invocation
Uses existing `chatApiGpt` with `Approaches.ReadRetrieveRead`. Minimal synthetic history seed is passed. Request includes the binary file (multipart). Response handled as `AskResponseGpt`; if `error` present, an error alert is shown.

## Result Presentation
Formatted tab renders a key-value list (values bold, prefixed bullet icon). Raw JSON tab renders the entire response body as pretty-printed JSON. Icon-only toolbar provides:
- Copy JSON (writes to clipboard)
- Download JSON (generates a blob + triggers download)

## Alerts / Notifications
Centered modal-style stacked alerts via `ToastHost`:
- Auto-dismiss (longer TTL for errors)
- Multi-line descriptions preserved using `white-space: pre-line`
- Intent-driven coloring (error/info/success/warning)

## Interaction Details
- Drag/drop disabled while analysis running
- All action buttons use `e.stopPropagation()` to prevent unintended file dialog opening
- File input cleared after every selection to allow re-selecting the same file
- Local overlay spinner replaces former global overlay (only covers upload zone)

## Accessibility
- Drop zone: `aria-label`, `aria-disabled` when processing
- Loading overlay announces status (role="alert" with `aria-live="polite"`)
- Alert notifications use `role="alert"` for errors and `role="status"` otherwise
- Buttons have textual labels (icons are supplemental)

## Styling Notes
- CSS Modules (`ImageAnalysisInput.module.css`, result panel css) define themes including dark-mode adjustments
- Bullet icon preceding each key implemented via inline SVG or pseudo element (depends on panel code)
- Centered alerts positioned using fixed viewport container with stacking flex column

## Key Props & Callbacks
`ImageAnalysisInput`:
- `onResult(result: AskResponseGpt)` – Emits successful analysis (even if contains `error` field)
- `onLoadingChange(loading: boolean)` – Signals analysis running state
- `onError(message: string)` – Emits validation / runtime error for alert display

`AnalysisResultPanel` (simplified):
- `result?: AskResponseGpt` – Data to render
- Internal tab state for Formatted / Raw views

## Error Handling Examples
- Unsupported extension → centered error alert: "Uploaded file error. Supported formats: ..."
- Oversize file (>2MB) → "Image exceeds 2MB size limit." alert
- Preview load failure → "Failed to load image preview." alert
- Backend failure → Response `error` surfaced in alert

## Future Enhancements (Backlog Candidates)
- Optional dimension display (currently commented out)
- JSON syntax highlighting & collapsible sections
- Keyboard shortcuts (Ctrl+C for copy JSON when Raw tab focused)
- Cancellation token for analysis request
- Drop zone visual pulse on error state
- Accessibility review for high-contrast mode

## Maintenance Guidelines
- Keep whitelist + accept attribute consistent
- Revoke object URLs on every reset/unmount
- Ensure multi-line error content uses template literals and preserved whitespace via CSS
- When adding new formats, update: whitelist, error message text, placeholder supported list, accept attribute

## Removal / Changes from Earlier Iterations
- Removed global full-page loading overlay in favor of localized spinner
- Deprecated per-line metadata removal (single reset instead)
- Replaced corner toast notifications with centered alert stack
- Removed `.webp` support after evaluation

## Quick Reference Snippets

Whitelisted extensions array (excerpt):
```ts
const allowedExt = ["jpg","jpeg","jpe","jif","jfi","jfif","png","bmp","heic","heif"]; // lowercase
```

Explicit file input accept (no webp):
```tsx
<input accept=".jpg,.jpeg,.jpe,.jif,.jfi,.jfif,.png,.bmp,.heic,.heif" />
```

Multi-line unsupported file alert string:
```ts
const msg = `Uploaded file error.\nSupported formats:\n.jpg .jpeg .jpe .jif .jfi .jfif\n.png .bmp\n.heic .heif`;
```

## Testing Recommendations
- Attempt uploading a disallowed extension (.webp/.gif) → error alert appears
- Re-select same file twice → change event fires (input value cleared)
- Oversize file mock (>2MB) → size limit alert
- Network error simulation → backend `error` field surfaced

---
Document last updated: November 4, 2025
\n+### Duplicate Image Selection Handling
If the user selects the exact same file again (same name and size) without having removed/reset it, the component now surfaces a user-friendly error instead of silently reloading:

```ts
if (file && f.name === file.name && f.size === file.size) {
	const msg = "You have already selected this image. Choose a different file to replace it.";
	setError(msg);
	onError?.(msg);
	return;
}
```

Rationale: Prevents confusion when clicking the picker and choosing the identical file (no visual change). Encourages explicit change or reset for clarity. This alert uses the same centered toast mechanism.
