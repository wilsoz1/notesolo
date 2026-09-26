# NoteSolo — open-source model gateway

All AI runs on models you host: **Unlimited-OCR** (documents → markdown) + **Qwen3-32B-AWQ**
(markdown → structured JSON via vLLM guided decoding, drafting, portfolio Q&A). No per-token
API costs — your only bill is the GPU while it's powered on.

## Boot the stack (Lambda 1× A100, Lambda Stack image)

```bash
git clone https://github.com/wilsoz1/notesolo && cd notesolo/server
export SUPABASE_SERVICE_ROLE_KEY=...        # Supabase dashboard → settings → API
export CADDY_DOMAIN=api.notesolo.com     # add an A record for this → the box IP
docker compose up -d --build
```

First boot downloads ~25GB of weights (cached in a volume; restarts are fast). Both models
fit one 40GB A100. When you power the box off, the app keeps working — AI actions show as
unavailable and everything else is unaffected.

## Point the site at it

Open `https://notesolo.com/?api=https://api.notesolo.com` once per browser.

## Endpoints

`GET /api/health` · `POST /api/extract` (OM → deal sheet) · `POST /api/spread`
(document_id → populated spread draft) · `POST /api/classify` (content-based routing)
· `POST /api/obligations` (loan agreement → ticklers + covenants) · `POST /api/draft`
(annual review / portfolio brief) · `POST /api/ask` (NL question → whitelisted query → answer).

All document endpoints take the caller's Supabase JWT and only touch that user's org.

## Local dev without a GPU

```bash
MOCK=1 SUPABASE_SERVICE_ROLE_KEY=... uvicorn main:app --port 8787
```

`MOCK=1` returns canned model output so the full app loop is testable end to end.
