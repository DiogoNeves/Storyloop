.PHONY: dev backend prod build test test-backend test-frontend lint lint-backend lint-frontend seed cloudflare-dev cloudflare-deploy cloudflare-db-migrate-local cloudflare-db-migrate-remote

ensure-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	fi
	@if [ ! -f .env.prod ]; then \
		cp .env.example .env.prod; \
		echo "Created .env.prod from .env.example"; \
	fi

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8001

dev: ensure-env
	python scripts/dev.py

build:
	cd frontend && pnpm build

prod: ensure-env
	python scripts/dev.py --prod

test:
	make test-backend
	make test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && pnpm run test -- --run

lint:
	make lint-backend
	make lint-frontend

lint-backend:
	cd backend && uv run ruff check .

lint-frontend:
	cd frontend && pnpm run lint

cloudflare-dev:
	cd cloudflare && npx wrangler dev

cloudflare-deploy:
	cd frontend && VITE_API_BASE_URL= pnpm build
	cd cloudflare && npx wrangler deploy

cloudflare-db-migrate-local:
	cd cloudflare && npx wrangler d1 migrations apply storyloop-app --local

cloudflare-db-migrate-remote:
	cd cloudflare && npx wrangler d1 migrations apply storyloop-app --remote
