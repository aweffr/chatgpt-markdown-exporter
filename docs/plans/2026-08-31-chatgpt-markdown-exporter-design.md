# ChatGPT Markdown Exporter Design

**Date:** 2026-08-31  
**Status:** Approved, revised after extension-source review

## 1. Goal

Build a small, local-only Chrome Manifest V3 extension that matches the current
ChatGPT Exporter interaction where it matters:

- Show a persistent export entry near the ChatGPT composer.
- Let the user select individual messages from the currently open conversation.
- Export the selected messages as one Markdown file.
- Preserve useful Markdown content and citation sources.
- Avoid accounts, subscriptions, watermarks, telemetry, remote services, and
  unrelated export formats.

The extension must export only the branch currently visible in ChatGPT.

## 2. Confirmed User Experience

The export button appears near the ChatGPT input area only when a saved
conversation is open.

The extension starts loading the complete active branch in the background when
the saved conversation opens. Clicking the button enters message-selection
mode as soon as that preload is ready:

- Every user and assistant message on the active branch is selected by default,
  including earlier messages that ChatGPT has virtualized out of the DOM.
- Each message can be selected independently.
- A fixed bottom toolbar provides:
  - Select all
  - Select none
  - `Selected N / M`
  - Export Markdown
  - Cancel
- A successful download exits selection mode and removes all injected controls.
- Switching conversations or changing branches exits stale selection mode.
  Rebuilding the same conversation DOM reattaches controls without losing the
  current selection.

## 3. Scope

### Included

- Current saved conversation only
- Current visible branch only
- Individual user and assistant message selection
- User-visible text, headings, lists, code blocks, tables, formulas, links, and
  blockquotes
- User-visible targeted replies and reasoning summaries
- Web citation sources rendered as Markdown footnotes
- Image and attachment links without downloading or embedding files
- Best-effort model version on assistant messages
- Local Markdown generation and download
- Structured API path for the complete branch, with DOM enhancement for
  currently rendered messages

### Excluded

- PDF, HTML, Text, CSV, JSON, image, or ZIP export
- History, Project, workspace, or bulk conversation export
- Shared-conversation pages and React/Next.js Flight hydration decoding
- Canvas and full Deep Research report extraction
- Conversations with an answer still being generated
- Hidden chain-of-thought or other non-user-visible reasoning data
- Image or attachment downloading
- Accounts, subscriptions, quotas, or licensing
- Watermarks or exporter branding in downloaded files
- Analytics, telemetry, feedback reporting, or remote configuration
- Third-party backend services

## 4. Approaches Considered

### A. Independent API-first extension — selected

Use ChatGPT's structured conversation data to reconstruct the current branch.
Use the page DOM for UI placement, message-ID matching, and high-fidelity
enhancement of currently rendered messages. The DOM is not treated as the
complete message list because ChatGPT virtualizes long conversations.

This retains the reliable core architecture of the currently installed
commercial extension while removing its server, account, telemetry, PDF, and
multi-format layers.

### B. Reduce `pionxzh/chatgpt-exporter`

The project is mature and MIT-licensed, but it is a feature-rich React
userscript. Converting it to a small Chrome extension and removing bulk export
and unrelated formats would leave unnecessary tooling and complexity.

### C. Reduce `VMSTE/chatgpt-exporter`

The project already implements per-message selection but has no repository
license, no tests, and a large monolithic content script. It is not an
appropriate long-term foundation.

## 5. Architecture

The extension uses no UI framework and has no third-party runtime dependency.
Source modules are bundled into the files loaded by Chrome.

### Content script

- Detect ChatGPT single-page navigation.
- Mount the export button near the composer.
- Manage selection mode and the bottom toolbar.
- Use Shadow DOM for extension-owned surfaces where practical.
- Clean up injected UI on route or conversation changes.

### Page bridge

- Run in the ChatGPT page's main JavaScript environment.
- Observe ChatGPT's own API requests to obtain the current Bearer Token and
  temporary conversation ID when present.
- Send only the required values to the content script through page messages.
- Never persist or log the Token.

### Conversation client

- Obtain the current conversation ID from the URL or bridge data.
- Prefer a captured Token; use `/api/auth/session` when needed.
- Fetch structured conversation data.
- Accept either a direct `{ mapping, current_node }` payload or the same shape
  under `.data`. Other response shapes fail explicitly.
- Determine the active branch from the last visible normalized message ID
  present in `mapping`, then from the last visible `data-turn-key`. Follow the matched
  node's last-child chain to its leaf. Use `current_node` only when neither DOM
  identifier matches.
- Follow `leaf -> parent` and reverse the result to reconstruct the active
  branch.
- Parse message content, model metadata, citations, images, and attachment
  links.
- Retry once with a refreshed Token after an authorization failure.
- Start loading in the background before the user clicks Export and cache the
  result for the current route.
- Fail explicitly when the complete API branch cannot be obtained; never
  silently export only the currently rendered tail of a long conversation.

### Selection controller

- Match structured messages to currently rendered elements using the normalized
  IDs from the shared page-message reader.
- Include every exportable message on the active branch, whether or not its DOM
  element is currently mounted.
- Maintain selected message IDs independently of DOM positions or text.
- Default all branch messages to selected. Attach or reattach a checkbox when a
  virtualized message becomes visible as the user scrolls.

### Markdown renderer

- Accept only the selected, ordered messages.
- Render deterministic Markdown with no network activity.
- Re-number and deduplicate citations after message filtering.
- Send the final Markdown and sanitized filename to a minimal extension service
  worker, which starts the local download with an explicit `.md` filename.

### Download service worker

- Receive only the generated Markdown and sanitized filename from the content
  script.
- Start the local file download through `chrome.downloads` so current stable
  Chrome does not replace a content-script Blob download name with a UUID.
- Perform no network, storage, telemetry, or background processing.

## 6. Data Flow

1. Detect a supported `/c/{conversationId}` route, including one nested under
   `/g/{gizmoId}`.
2. Mount the export button immediately to the right of the composer and begin
   loading the complete current branch in the background.
3. If an answer is still generating, refuse to enter selection mode. The
   extension does not wait for or export a partial response.
4. Reuse the prefetched conversation, or wait for the in-flight request with a
   bounded timeout and a visible loading state.
5. Parse every exportable user and assistant message on the active API branch.
6. Match any currently mounted DOM messages by message ID and role.
7. Inject selected checkboxes and show the bottom toolbar.
8. Filter the ordered message list by selected IDs.
9. Render Markdown and ask the local service worker to download
   `{conversation title}-YYYY-MM-DD-HH-mm.md`.
10. Remove the selection UI after a successful download or cancellation.

The implementation must not infer message identity from array position or text
equality.

## 7. Markdown Contract

Example:

```markdown
# Conversation title

## 用户

User message.

---

## ChatGPT · GPT-5.4

Assistant response with a source reference[^1].

---

[^1]: [Source title](https://example.com)
```

Rules:

- The conversation title is the only level-one heading.
- User messages use the level-two heading `用户`.
- Assistant messages use `ChatGPT` and append a readable model version when
  reliable metadata exists.
- Missing model metadata does not produce a placeholder.
- No timestamps, account data, original conversation link, exporter name, or
  watermark are emitted.
- Selected messages retain their original order even when intermediate messages
  are omitted.
- Existing Markdown paragraphs, headings, lists, code fences, tables, formulas,
  links, and blockquotes are preserved.
- A targeted reply is rendered as a Markdown blockquote before the new message
  body.
- A user-visible reasoning summary is rendered as a labelled Markdown
  blockquote. Hidden chain-of-thought is never exported.
- Images remain Markdown image links.
- Attachments remain ordinary Markdown links.
- A `{{file:...}}` placeholder is replaced by its attachment link when a name
  and URL are available, by a readable attachment label when only a name is
  available, or removed when it cannot be resolved. Internal placeholders are
  never emitted verbatim.
- Resources are not downloaded, uploaded, embedded, or rewritten.
- Citations are numbered by first appearance in the final selected output.
- The same canonical URL reuses one footnote.
- Footnotes used only by unselected messages are omitted.
- A source without a title uses its hostname.
- An invalid or missing source URL does not create a broken footnote.

## 8. DOM Integration

The current page integration uses semantic data attributes:

- Message units: `[data-chatgpt-search-message-ids]`
- User identity: the unit's message ID and `[data-user-message-bubble]`
- Assistant identity: the nested `[data-chatgpt-selection-message-id]`, rather
  than the unit's potentially duplicated list of answer and tool IDs
- Assistant body: `[data-markdown-text-style="assistant-message"]`
- Model fallback: `data-message-model-slug`
- Conversation turns: `[data-turn-key]`
- Composer: `form[data-chatgpt-composer] [data-composer-surface-variant]`
- Citations: `[data-testid="chatgpt-citation"]`; the accessible label provides
  the full source title, while `href` provides the URL
- Code blocks: `[data-markdown-copy="code-block"] code`
- Exclude controls marked `[data-markdown-copy="exclude"]`; retain image links
  even when the preview image is wrapped in a button
- Retain uploaded resource-card filenames and library-file citation names as
  attachment labels when the DOM provides no download URL

Selectors must be centralized. The extension will not fetch selector
configuration remotely. The button is absolutely positioned immediately to the
right of the matched composer container and vertically centered with it.

Conversation-turn containers are not assumed to be exportable messages. Message
ID and role remain the identity boundary.

## 9. Error Handling and Degradation

The extension may degrade, but it must not silently download a known-incomplete
file.

- No saved conversation: do not show the export button.
- Answer still generating: do not enter selection mode and show
  `回答生成完成后可导出`. No waiting, partial export, or streaming retry is
  implemented.
- `401`: refresh the Token and retry once.
- API unavailable or timed out: show an inline error and do not download a
  potentially incomplete DOM-only file.
- API/DOM message mismatch: re-read once, then exit selection mode with an
  inline error.
- API and DOM extraction both fail: do not create a download.
- Citation parsing failure: preserve the message and any ordinary usable link.
- Model metadata unavailable: omit the model suffix.
- Download failure: preserve selection state so the user can retry.
- Route or conversation change: clean up old controls and state.

Errors appear next to the export controls, not in `alert()` dialogs. Console
diagnostics include stages and error summaries but never Tokens, conversation
text, or account information.

## 10. Permissions and Networking

Host access is limited to ChatGPT domains required for the current page and
same-origin conversation requests.

The extension does not need:

- Extension storage
- External network hosts
- Externally connectable pages

The extension uses the `downloads` permission and a minimal service worker only
to force a stable `{conversation title}-YYYY-MM-DD-HH-mm.md` filename. This
avoids current stable Chrome replacing isolated-world Blob download names with
UUIDs.

All runtime network activity is limited to the same ChatGPT session and only
occurs when needed to read the current conversation.

## 11. Testing and Acceptance

### Unit tests

- Active-branch reconstruction using the DOM leaf hint before `current_node`
- Exclusion of regenerated sibling branches
- Direct and `.data`-wrapped conversation payloads
- Selection filtering and stable message order
- Complete active-branch extraction when earlier messages are not mounted in
  the DOM
- Select-all and select-none state
- Model version normalization and omission
- Citation numbering, filtering, and URL deduplication
- Citation title and hostname fallback
- Preservation of code blocks, tables, formulas, images, and attachment links
- Targeted-reply blockquotes, visible reasoning-summary blockquotes, and file
  placeholder replacement
- Filename sanitization
- Complete `{conversation title}-YYYY-MM-DD-HH-mm.md` download filenames
- Absence of watermarks, exporter branding, and account data

### Browser E2E

Load the real extension in a browser against a ChatGPT-shaped fixture page and
verify:

1. The export button appears beside the composer.
2. Clicking it selects every message on the complete active branch.
3. Select none, select all, and individual deselection work.
4. The selected count is correct.
5. The downloaded Markdown file contains exactly the selected messages.
6. A virtualized fixture with only the bottom messages mounted still exports
   the complete branch.
7. API failure refuses to create a known-incomplete download.
8. Route changes remove stale UI; same-branch DOM rebuilds reattach controls.
9. An answer still being generated cannot enter selection mode or produce a
   partial download.

### Real ChatGPT smoke tests

- Ordinary text conversation
- Code, table, or formula conversation
- Conversation with Web citations
- Conversation with image or attachment links
- Conversation with regenerated branches

Delivery requires passing build, typecheck, unit tests, and Playwright E2E,
followed by inspection of the actual downloaded Markdown.
