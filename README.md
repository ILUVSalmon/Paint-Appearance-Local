# Paint Appearance — development repository

Paint Appearance is an internal web application for paint-quality measurements at four
Ford plants (**AAT, FTM, FVL, SAP**). Plant staff upload the Excel workbooks produced by the
**Wave Scan** (appearance: long/short wave, DOI, …) and **Film Thickness** gauges; the
application checks and stores every reading, grades it against the colour standards, and
shows per-plant overviews, history, point checks, comparisons and reports.

- **Backend:** Python 3.13, FastAPI, SQLAlchemy, Alembic — `backend/`
- **Frontend:** React 19, TypeScript, Vite, TanStack Router/Query, Tailwind — `frontend/`
- **Database:** PostgreSQL 18
- **This release has no sign-in.** Every request acts as one shared account with every
  role (`AUTH_OPEN_ACCESS=true`). Sign-in will be added later by another team.

This repository is for **development**. The deployment package for Google Cloud is a
separate repository (Paint Appearance Website).

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the code and the data](#2-get-the-code-and-the-data)
3. [Set up the database](#3-set-up-the-database)
4. [Run the backend](#4-run-the-backend)
5. [Run the frontend](#5-run-the-frontend)
6. [Run the tests](#6-run-the-tests)
7. [Docker Compose instead](#7-docker-compose-instead)
8. [Configuration](#8-configuration)
9. [Project structure](#9-project-structure)
10. [Troubleshooting](#10-troubleshooting)
11. [For the owner: making the data dump](#11-for-the-owner-making-the-data-dump)

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | any recent | |
| Python | **3.13** | `python --version`. On Windows, tick "Add python.exe to PATH". |
| Node.js | **24** | `node --version` |
| pnpm | **10.32.1** | Comes with Node through Corepack: `corepack enable`, then `corepack prepare pnpm@10.32.1 --activate`. If `pnpm` is still not found, write `corepack pnpm` wherever this file says `pnpm`. |
| PostgreSQL | **18** | Server plus the client tools `psql`, `pg_restore`, `pg_dump`. On Windows add `C:\Program Files\PostgreSQL\18\bin` to `PATH`. Remember the `postgres` password you choose during installation. |
| Docker Desktop | optional | Only for [section 7](#7-docker-compose-instead). |

Commands below are shown for **PowerShell** (Windows). On macOS/Linux use the same
commands with `/` paths, `source .venv/bin/activate`, and `export NAME=value` instead of
`$env:NAME = "value"`.

## 2. Get the code and the data

```powershell
git clone https://github.com/APAENSOT/Paint-Appearance.git "Paint Appearance Local"
cd "Paint Appearance Local"
```

**The plant data is not in git.** These are real Ford plant measurements, so the
database dump is never committed. Ask the project owner for the current dump file
(`paint_appearance_<date>.dump`, a `pg_dump -Fc` file of about 25 MB) and put it in
the `data/` folder of this checkout (create it; `data/` is gitignored):

```
Paint Appearance Local/
└── data/
    └── paint_appearance.dump
```

Why a dump and not just migrations: the migrations alone cannot build a usable database
from empty (migration `0025` seeds standards for colours that were added through the
application), so every install restores the dump first and then runs the migrations
newer than it.

## 3. Set up the database

The application uses two database roles:

| Role | Purpose |
|---|---|
| `migrator` | Owns the `paint_appearance` database and all its tables. Runs `alembic upgrade head`. |
| `app_rw` | The **only** role the API uses: read, insert, a few narrow updates; no DELETE and no DDL. The API refuses to start as `postgres`, `migrator` or any other privileged role. |

Choose two passwords, then run these from the repository root. `psql` asks for the
`postgres` password, `pg_restore` for the `migrator` password:

```powershell
# 3.1  create migrator, app_rw and the empty paint_appearance database (once)
psql -h localhost -U postgres -d postgres `
     -v migrator_password='CHOOSE-A-MIGRATOR-PASSWORD' `
     -v app_rw_password='CHOOSE-AN-APP-PASSWORD' `
     -f db/create_roles.sql

# 3.2  load the data as migrator: every object ends up owned by migrator, grants to app_rw come with it
pg_restore -h localhost -U migrator --no-owner -d paint_appearance data/paint_appearance.dump
```

`pg_restore` should finish without printing any error. Check it:

```powershell
psql -h localhost -U postgres -d paint_appearance -c "select version_num from alembic_version" -c "select count(*) from wavescan"
```

The migrations are run in the next section, once Python is set up.

## 4. Run the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements-dev.txt   # pinned versions
pip install --no-deps -e .
```

If PowerShell refuses to run `Activate.ps1`, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or call
`.\.venv\Scripts\python.exe` directly.

**Configure.** Copy the example and put the `app_rw` password into `APP_DATABASE_URL`:

```powershell
Copy-Item .env.example .env
notepad .env      # APP_DATABASE_URL=postgresql+psycopg://app_rw:<app password>@localhost:5432/paint_appearance
```

`backend/.env` is gitignored. It sets `ENV=development` and `AUTH_OPEN_ACCESS=true`
(the same no-sign-in mode as the deployed site). To try the role checks instead, set
`AUTH_OPEN_ACCESS=false` and `AUTH_DEV_BYPASS=true` with `AUTH_DEV_BYPASS_ROLES` set to
any of `viewer,engineer,admin`. Never set both.

**Migrate** (as `migrator`; the API never sees this URL):

```powershell
$env:MIGRATOR_DATABASE_URL = "postgresql+psycopg://migrator:<migrator password>@localhost:5432/paint_appearance"
alembic upgrade head
alembic current            # prints the head revision, e.g. 0050 (head)
Remove-Item Env:MIGRATOR_DATABASE_URL
```

**Start the API:**

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Check it in another terminal or the browser:

- http://127.0.0.1:8000/health/ready → `{"status":"ready", ...}` (database reachable as `app_rw`, raw store writable)
- http://127.0.0.1:8000/api/v1/auth/me → `"auth_source": "open-access"`
- http://127.0.0.1:8000/docs → Swagger UI

Uploaded workbook files are stored under `data/raw/` (gitignored) unless `RAW_STORE_DIR`
says otherwise. The ingest worker runs inside the API process.

## 5. Run the frontend

In a second terminal, from the repository root:

```powershell
cd frontend
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local    # VITE_API_BASE_URL=http://127.0.0.1:8000
pnpm dev
```

Open **http://localhost:5173** and choose a plant. Restart `pnpm dev` after changing
`.env.local`. If you run the API on another port, change `VITE_API_BASE_URL` and add the
frontend's origin to `CORS_ORIGINS` in `backend/.env`.

**One origin, like production** (optional): build the frontend with an empty API URL
and let the API serve it.

```powershell
cd frontend
$env:VITE_API_BASE_URL = ""; pnpm build; Remove-Item Env:VITE_API_BASE_URL
cd ../backend
$env:STATIC_DIR = "../frontend/dist"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then open http://127.0.0.1:8000.

## 6. Run the tests

### Frontend (no database needed)

```powershell
cd frontend
pnpm types:generate      # regenerates src/api/types.ts from docs/openapi.json; git diff must stay empty
pnpm typecheck
pnpm lint
pnpm test                # node --test unit tests
pnpm build
```

The Playwright browser specs in `frontend/tests/browser/` drive a running site
(`FRONTEND_URL`, default http://localhost:5173) with Google Chrome:
`pnpm exec playwright test`. Several of them expect the live data and the API on port
8012, as on the owner's machine; they are not part of CI.

### Backend without a database (what CI runs)

```powershell
cd backend
$env:T01_DB = "none"
python -m pytest tests -q -o addopts=""
Remove-Item Env:T01_DB
```

Tests that need a database are reported as "deselected".

### Backend, full suite

Most backend tests check real PostgreSQL privileges and the real plant data, so they need
a restored copy of the database. **Use a separate test copy**, not the database you work
in: the tests roll back or clean up after themselves, but some create and drop temporary
rows and roles.

```powershell
# a test copy from the same dump (the roles already exist from step 3.1)
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE paint_appearance_test OWNER migrator ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0"
pg_restore -h localhost -U migrator --no-owner -d paint_appearance_test data/paint_appearance.dump
```

Then create `backend/.env.test` (gitignored) with two connection strings in libpq form —
the **superuser** for catalog checks and fixtures, and **app_rw** for every
"must be refused" check:

```
T01_ADMIN_DSN=host=localhost port=5432 dbname=paint_appearance_test user=postgres password=<postgres password>
T01_APP_DSN=host=localhost port=5432 dbname=paint_appearance_test user=app_rw password=<app password>
```

Run it (about 10 minutes):

```powershell
cd backend
python -m pytest tests -q
```

Expected result on a fresh copy of the 2026-10-20 dump: about 2,390 passed, 0 failed and
about 27 skipped (tests skip when an optional input is absent, for example an uploaded
workbook that only exists in the original machine's raw store). If the database tests fail with "T01_ADMIN_DSN is not
set", `.env.test` is missing. Several tests compare the data with frozen reference files
in `backend/tests/fixtures/gold/`; they are written for the dump's contents, so a much
newer dump with different plant data can make them fail for data reasons, not code ones.

## 7. Docker Compose instead

`docker-compose.yml` runs PostgreSQL 18, the migration job, the API (serving the built
frontend) and, optionally, a Vite dev server. Every port is bound to `127.0.0.1`.

> The Compose and Docker files have been checked statically (they parse, every path they
> use exists, and the same commands were run natively) but **have not yet been run in
> Docker**. Report anything that does not work.

```powershell
Copy-Item .env.example .env          # then change the three passwords in .env
docker compose up -d postgres        # first start: creates migrator, app_rw, paint_appearance

# load the dump (it must be in ./data/, which the container sees as /import)
docker compose exec postgres pg_restore -U migrator --no-owner -d paint_appearance /import/paint_appearance.dump

docker compose run --rm migrate      # alembic upgrade head, as migrator
docker compose up -d --build api     # http://localhost:8000 (API + built frontend)
docker compose --profile dev up -d web   # optional: Vite dev server on http://localhost:5173
```

`docker compose down` stops everything; the database stays in the
`paint-appearance-pgdata` volume. `docker compose down -v` deletes it.

## 8. Configuration

The backend reads environment variables, and `backend/.env` for anything not set in the
environment. All names are case-insensitive.

| Variable | Default | Meaning |
|---|---|---|
| `ENV` | `development` | `development`, `test`, `staging` or `production`. Production adds HSTS and refuses the dev bypass. |
| `APP_DATABASE_URL` | — (required) | SQLAlchemy URL **as `app_rw`**, e.g. `postgresql+psycopg://app_rw:PW@localhost:5432/paint_appearance`. Privileged roles are refused at start-up. |
| `MIGRATOR_DATABASE_URL` | — | Read **only by Alembic**, never by the API. URL as `migrator`. |
| `AUTH_OPEN_ACCESS` | `false` | `true`: no sign-in; every request is the shared account with every role. Allowed in any `ENV`, so such a server must be on a private network only. |
| `AUTH_DEV_BYPASS` | `false` | `true`: a fixed local identity. Only when `ENV=development`; never together with `AUTH_OPEN_ACCESS`. |
| `AUTH_DEV_BYPASS_ROLES` | `viewer` | Comma list from `viewer`, `engineer`, `admin`. |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Browser origins allowed to call the API. No wildcard. Not needed when the API serves the frontend. |
| `API_DOCS_ENABLED` | `true` | Swagger UI at `/docs` and `/openapi.json`. |
| `STATIC_DIR` | empty | Folder with the built frontend to serve on the same origin. Empty: API only. |
| `RAW_STORE_DIR` | `<repo>/data/raw` | Where uploaded workbook bytes are kept (by SHA-256). |
| `INGEST_WORKER_ENABLED` | `true` | Run the ingest worker inside the API process. `false` + `python -m app.workers.ingest_worker` runs it separately. |
| `INGEST_WORKER_POLL_SECONDS` | `0.2` | Worker poll interval. |
| `UPLOAD_MAX_FILE_BYTES` | `26214400` (25 MB) | Per-file upload limit. |
| `UPLOAD_MAX_FILES` | `40` | Files per upload. |
| `UPLOAD_MAX_UNCOMPRESSED_BYTES` | `262144000` | Zip-bomb guard for `.xlsx` contents. |
| `UPLOAD_MAX_COMPRESSION_RATIO` | `200` | Zip-bomb guard. |
| `DUPLICATE_THRESHOLD` | `80` | Percent similarity at which an upload is flagged as a duplicate. |
| `DB_POOL_SIZE`, `DB_POOL_MAX_OVERFLOW` | `5`, `5` | SQLAlchemy connection pool. |
| `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_AUDIENCE` | empty | Reserved for the future Ford ID sign-in; unused now. |

Frontend (`frontend/.env.local`, read at build/dev time and **public**):

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | Origin of the API, no trailing slash. Empty: the page's own origin (when the API serves the frontend). |

## 9. Project structure

```
backend/
  app/
    api/            HTTP routes (health, /api/v1/...)
    core/           settings, database, identity and roles, security headers, logging, SPA serving
    domain/         pure logic: workbook reading, cleaning, grading, panel/point identity, analysis
    repositories/   SQL
    services/       use cases that tie routes, domain and repositories together
    schemas/        Pydantic request/response models (the OpenAPI contract)
    workers/        the ingest worker
  migrations/       Alembic revisions 0000–0050 (run as migrator)
  scripts/          emit_openapi.py (CI) and data-maintenance scripts used by the tests
  tests/            pytest suite; fixtures/gold holds frozen reference files
  requirements*.txt pinned dependencies; pyproject.toml holds the ranges
frontend/
  src/              routes/, features/ (measurements, filmthickness, analysis, intake, admin, ...),
                    api/ (typed client, generated types.ts), components/, lib/
  public/           static assets, including the 3D body models
  tests/            node --test unit tests; browser/ holds Playwright specs
db/                 create_roles.sql and the Docker init script
docs/               architecture, data model, pipeline, security, analysis, ADRs, OpenAPI
infra/gcp/          Cloud Run service and migrate-job definitions (for reference here)
Dockerfile          one image: builds the frontend, serves API + frontend
docker-compose.yml  local stack
.github/workflows/  CI: frontend checks, database-free backend tests, image build
```

Start with [docs/README.md](docs/README.md) for the design documents.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| API exits with `APP_DATABASE_URL connects as 'postgres'` (or `migrator`) | By design: the API runs as `app_rw` only. Fix `APP_DATABASE_URL`. |
| `/health/ready` returns 503 | Look at `checks` in the response: the database is unreachable, the password is wrong, `app_rw` has privileges it must not have, or `RAW_STORE_DIR` is not writable. |
| `alembic` says `MIGRATOR_DATABASE_URL is not set` | Set it in the shell for that command (section 4). |
| `pg_restore: error: role "migrator" does not exist` | Run step 3.1 first. |
| `pg_restore` printed errors about `app_rw` grants | `app_rw` did not exist when you restored. Drop the database, run 3.1, restore again. |
| Frontend shows "Cannot reach the API" / CORS error in the browser console | API not running, wrong `VITE_API_BASE_URL`, or the frontend origin is missing from `CORS_ORIGINS`. Restart `pnpm dev` after changing `.env.local`. |
| `pnpm: command not found` | `corepack enable`, or use `corepack pnpm ...`. |
| `pnpm lint` reports `Delete ␍` everywhere | Files were checked out with Windows line endings. The repo's `.gitattributes` forces LF; re-clone, or run `git add --renormalize .` and check out again. |
| Backend tests fail with `T01_ADMIN_DSN is not set` | Create `backend/.env.test` (section 6). |
| Port 5432 already in use (Docker) | Set `POSTGRES_PORT` in `.env`, e.g. `5433`. |

## 11. For the owner: making the data dump

On the machine that holds the plant database (on the original machine that is the
`t02_dev` cluster on port 55440):

```powershell
pg_dump -h 127.0.0.1 -p 55440 -U postgres -d t02_dev -Fc -f paint_appearance_2026-10-20.dump
```

Hand the file over outside git (company file share or an encrypted drive). It contains
real plant measurements and the names of the people who signed off reference data, so
treat it as internal data. Never attach it to a public GitHub repository or release.
