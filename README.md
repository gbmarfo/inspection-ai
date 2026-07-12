# PowerAI Prototype

A full-stack prototype inspired by Buzz Solutions' PowerAI 2.0 inspection platform — image annotation, mock AI inference, model training, and reporting.

## Features

- **Overview** — program-wide stats and recent activity
- **Structures** — towers and poles linked to inspection imagery
- **Images** — folder organization, upload to MinIO, browse, open in AI Processing
- **AI Processing** — Annotorious viewer with select/draw box tools, Buzz-style classification popup, map panel
- **Models** — vision model catalog, dataset stats, server-side training jobs with MLflow logging and model registry
- **Reports** — generate inspection summaries from the current dataset

## Architecture

```
React (Vite :5173)  →  proxy /api, /uploads
FastAPI (:3001)     →  SQLite + MinIO object storage
MinIO (:9000)       →  uploaded inspection images
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for MinIO)

## Run locally

```bash
# 1. Start MinIO
docker compose up minio -d

# 2. Install dependencies
npm install
pip install -r backend/requirements.txt

# 3. Configure environment (optional — defaults work with local MinIO)
cp .env.example .env

# 4. Run frontend + API
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api/health
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

## Production

```bash
npm run build
npm start
```

FastAPI serves the built frontend from `dist/` when `NODE_ENV=production`.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Annotorious, Leaflet
- **Backend:** Python, FastAPI, SQLite, MinIO (S3-compatible storage)
- **Seed assets:** `public/assets/` (static)
- **Uploads:** stored in MinIO bucket `powerai`, served via `/uploads/...`

## API (selected)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/images` | List images with annotations |
| POST | `/api/images/upload` | Upload images to MinIO (runs mock inference) |
| GET | `/uploads/{path}` | Stream uploaded object from MinIO |
| GET/POST | `/api/folders` | List/create image folders |
| POST | `/api/models/training/jobs` | Start a training job (logs to MLflow, registers model on completion) |
| GET | `/api/models/mlflow/registered` | List models in the MLflow Model Registry |
| POST | `/api/reports/generate` | Generate inspection report |
