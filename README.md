# Scatter

A freeform corkboard workspace: scatter notes, todo lists, and kanban boards on one draggable canvas, with a local AI assistant that can read your cards and help you plan.

- **Notes** support markdown and raw HTML, including interactive checkboxes (both `- [ ]` task-list syntax and `<input type="checkbox">`), with their checked state persisted independently of the source text.
- **Todo lists** and **kanban boards** are structured card types with their own editing UI.
- Everything is **local-first**, saved to IndexedDB in your browser (with a localStorage fallback so an edit right before closing the tab isn't lost). No account, no server.
- The assistant runs a small LLM **entirely in your browser** via [WebLLM](https://webllm.mlc.ai/) (WebGPU), no API key, nothing leaves your machine. Needs a recent Chrome or Edge; the model downloads once (~1-2.4GB depending on which tier you pick) and is cached after that.

## Developing

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
npm run lint     # oxlint
```
