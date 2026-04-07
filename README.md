# Lumenci Spark (claim-chart copilot)

Functional demo for **Lumenci Spark**: an AI-assisted workspace where patent analysts upload claim charts and technical documents, refine evidence and reasoning via chat, and export the **saved** chart to Word.

## What’s included

- **Left panel:** 3-column grid (patent claim element · evidence · AI reasoning), compact row meta (origin, strength, edit), Accept/Reject diffs, undo/redo, edit history.
- **Right panel:** Lumenci Spark chat, collapsible **Docs** workspace (charts + per-chart technical documents), custom instructions, quick shortcuts, export.
- **Backend:** Django + SQLite, Groq chat API, document text extraction for RAG-style context, structured suggestion apply pipeline, `.docx` export.
- **Uploads:** Claim chart from Excel/CSV/DOCX/PDF/image (OCR where Tesseract is available). Product/technical **files** or **public URL capture** (HTML → text) per claim chart, fed into the same RAG snippets as uploads.

## Assessment coverage (prototype vs. brief)

| Requirement | Status |
|-------------|--------|
| Upload claim chart + product docs | Yes (`+` menu, Docs panel) |
| System prompts / custom instructions | Yes (modal, saved per chart) |
| 3-column claim chart UI | Yes |
| Chat refinement (e.g. weak ML reasoning) | Yes |
| AI suggestions in chat | Yes (cards + tagged JSON) |
| Accept / reject / iterate in chat & grid | Yes |
| Updated chart visible after accept | Yes |
| Export refined chart to Word | Yes (saved rows only; accept pending edits first) |
| Skip authentication | Yes |
| **User flow diagram** | [docs/USER_FLOW.md](docs/USER_FLOW.md) — Mermaid (export PNG from [mermaid.live](https://mermaid.live)) |
| URL capture for evidence | **Yes** — **+ → Add evidence from public URL** (HTML → plain text, same RAG path as uploads; private/localhost blocked) |

## Run locally (Windows PowerShell)

```bash
python -m pip install -r requirements.txt
copy .env.example .env
# Edit .env: set GROQ_API_KEY, DJANGO_DEBUG=1 for local dev
python manage.py migrate
python manage.py runserver
```

Open `http://127.0.0.1:8000/`.

**OCR (optional):** Install [Tesseract](https://github.com/tesseract-ocr/tesseract) and ensure `tesseract` is on PATH for image / some PDF charts. Docker image includes Tesseract.

## Deploy (Docker — recommended)

The included `Dockerfile` runs migrations, serves the app with Gunicorn, and bundles Tesseract.

1. Copy `.env.example` to environment variables on your host (PaaS dashboard or `docker compose`).

2. Set at minimum:

   - `GROQ_API_KEY`
   - `DJANGO_SECRET_KEY` — long random string
   - `DJANGO_DEBUG=0`
   - `DJANGO_ALLOWED_HOSTS` — your hostname(s), comma-separated (no spaces), e.g. `app.onrender.com`
   - `DJANGO_CSRF_TRUSTED_ORIGINS` — `https://your-host` (comma-separated if several)

3. **Persistence:** SQLite and uploaded files live under `/app` in the container. For any host that recycles disks, mount a **persistent volume** for:

   - `db.sqlite3` (or switch to Postgres later)
   - `media/` (uploaded charts and product docs)

   Example with `docker compose`: the repo already mounts `./db.sqlite3` and `./media` (see `docker-compose.yml`). Point the same pattern at a cloud volume path your provider supports.

4. Build and run:

```bash
docker compose up --build
```

For a **public URL**, use your provider’s “Docker deploy”, set env vars there, and attach persistent storage as above.

## Publish a “submission link”

After deploy, your **published link** is the HTTPS origin you configured (e.g. `https://your-service.onrender.com`). Ensure `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` include that host.

## Prototype constraints

- No end-user authentication (assessment allows skipping this).
- No automatic URL scraping; analysts upload files or paste text.
- Desktop-oriented layout; SQLite OK for demo volume.

## Related docs

- [docs/USER_FLOW.md](docs/USER_FLOW.md) — Mermaid flow + edge cases for the assessment diagram deliverable.
- [docs/PRD_Lumenci_Spark_MVP.docx](docs/PRD_Lumenci_Spark_MVP.docx) — PRD (regenerate with `python scripts/generate_prd_docx.py` if needed).
