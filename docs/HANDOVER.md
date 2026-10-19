# Handover: moving development to another computer

This page is for whoever continues development of Paint Appearance on a new computer.
It says what is ready, what you have to do yourself, and which decisions are still open.
The setup steps are in the [README](../README.md).

## 1. What is ready

| Area | State | Checked by |
|---|---|---|
| Code | Backend (FastAPI, Python 3.13), frontend (React + Vite, Node 24, pnpm 10.32.1), migrations (Alembic). No AI working notes, logs or reports. | Fresh install from this repository on a clean folder. |
| Docker Compose | `docker-compose.yml`: PostgreSQL 18 (creates `migrator`, `app_rw` and the database on first start), a `migrate` job, the API serving the built site on http://localhost:8000, and an optional Vite dev server. Every port is bound to `127.0.0.1` only. | CI job `compose` starts the stack from `.env.example` on every push and checks the database, the migrations, the API health check and the site. |
| Without Docker | README sections 3-5: local PostgreSQL, a Python venv, pnpm. | Followed literally on a fresh folder. |
| Tests | Frontend: typecheck, lint, 478 unit tests, build. Backend: the database-free tests in CI; the full suite (about 2,400 tests) passes against a restored copy of the data. | CI on every push; the full suite was run before handover. |
| Sign-in | None in this release: `AUTH_OPEN_ACCESS=true`, one shared account with every role. | Unit tests and the CI check of `/api/v1/auth/me`. |

## 2. What you have to do on the new computer

1. **Install the prerequisites** (README section 1). For Docker on Windows: Docker Desktop
   with WSL 2 (needs admin rights and one restart).
2. **Get the data dump from the application owner** through a private channel. It is
   **not** in this public repository: it holds plant measurements plus user names and
   email addresses. Put it in `data/` (gitignored). Never commit it.
3. **Create `.env`** from `.env.example` and replace the three `change-me` passwords.
   `.env` is gitignored.
4. Choose **Compose** (README section 7) or **native** (sections 3-5), restore the dump,
   then run `alembic upgrade head`.
5. Open http://localhost:8000 (Compose) or http://localhost:5173 (Vite dev server) and
   check that the header reads **Database: Connected** and every plant's pages load.
6. Run the tests (README section 6) once, to know your baseline.

Why the dump and not just migrations: migrations stop at 0024 on an empty database,
because 0025 seeds Film standards for colours that exist only in the real data. CI
migrates an empty database to 0024 to check the wiring; real work always starts from
the dump.

## 3. Open decisions

| # | Decision | Our recommendation |
|---|---|---|
| 1 | PostgreSQL major version for Cloud SQL (D6) | 18: everything was run on 18. Keep `POSTGRES_MAJOR=18` locally to match. |
| 2 | Sign-in | Another team adds Ford ID / Entra sign-in later. The role checks are in the code; set `AUTH_OPEN_ACCESS=false` once tokens are validated in `backend/app/core/security.py`. |
| 3 | Exposure while there is no sign-in | Never publish this stack beyond your own machine: anyone who reaches it can upload and change standards. Compose already binds to `127.0.0.1` only. |
| 4 | Plant data visibility (D3), grading (D1), file retention (D4) | Still open; see [DEFERRED.md](DEFERRED.md). Do not switch grading on without the product owner. |
| 5 | A person's name in a public repository | The data owner's name appears in a test fixture, two tests and `docs/DEFERRED.md`. Decide with the owner whether to remove it or make the repository private. |

The deployment package for Google Cloud is a separate repository
(`Paint-Appearance-Website`) with its own handover page.
