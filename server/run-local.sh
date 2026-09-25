#!/bin/zsh
# Run the NoteSolo gateway against local Ollama (Apple Silicon dev setup).
# Prereqs: Ollama running; models built via:
#   ollama create notesolo-llm  (FROM qwen3:8b,     num_ctx 16384)
#   ollama create notesolo-ocr  (FROM qwen2.5vl:7b, num_ctx 32768)
# Service key in .env.key (gitignored). Connect a browser once via
# https://notesolo.com/?api=http://localhost:8787 (Chrome).
cd "$(dirname "$0")"
export OCR_BASE_URL=http://localhost:11434/v1
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=notesolo-llm
export OCR_MODEL=notesolo-ocr
export OCR_BATCH_PAGES=1
# Per-page transcription; collapsing leader dots stops small VLMs from
# hitting Ollama's token-repeat abort on forms with dotted leader lines.
export OCR_PROMPT="Transcribe every word and number on this page image to markdown, preserving layout and tables. Replace any long run of dots, dashes or underscores (leader lines) with a single colon. No commentary."
export SUPABASE_SERVICE_ROLE_KEY="$(cat .env.key)"
# Local debugging: every request dumps what the OCR saw and what was extracted.
export DEBUG_DIR=/tmp
exec .venv/bin/uvicorn main:app --port 8787
