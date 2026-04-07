# Lumenci Spark — analyst user flow (assessment diagram)

Paste the block below into [Mermaid Live Editor](https://mermaid.live) to export PNG/SVG, or view this file on GitHub (renders Mermaid).

```mermaid
flowchart TD
  A[Landing: Lumenci Spark] --> B[Create or select Matter]
  B --> C[Upload claim chart from + menu]
  C --> D{Parse OK?}
  D -->|Yes| E[3-column grid: claim / evidence / reasoning]
  D -->|No| C2[Fix file or format] --> C
  E --> F[Optional: Custom instructions per chart]
  E --> G[Optional: Docs — attach technical docs to active chart]
  F --> H[Chat: refinement request\n e.g. strengthen evidence, fix reasoning]
  G --> H
  H --> I[AI: prose + structured suggestions\n lumenci_suggestion_json]
  I --> J{Analyst}
  J -->|Accept / Reject in grid| K[Persisted chart state]
  J -->|Continue conversation| H
  K --> L[Undo / Redo / history]
  L --> H
  K --> M[Export Word — saved rows]
  M --> N[Handoff for proceedings]

  I -.->|Edge: wrong evidence| J2[Correct via chat — new suggestions] --> H
  K -.->|Edge: undo refinement| L
  I -.->|Edge: no evidence in docs| O[AI: ask for URL capture, file upload, or paste excerpts] --> G
```

## Edge cases (assessment)

| Scenario | Product behavior |
|----------|------------------|
| AI cites wrong evidence | Analyst explains in chat; model issues corrected suggestions; accept/reject in grid. |
| Undo a refinement | **Undo** / **Redo** and edit history strip on the chart chrome. |
| AI cannot find evidence | Prompts analyst to use **Add evidence from URL** (server fetches public HTML and stores text), **upload** a file, or **paste excerpts** (localhost/private URLs are blocked). |
