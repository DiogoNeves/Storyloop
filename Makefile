.PHONY: dev backend prod build test test-backend test-frontend lint-frontend seed

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8001

dev:
	python scripts/dev.py

build:
	cd frontend && pnpm build

prod:
	python scripts/dev.py --prod

test:
	make test-backend
	make test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && pnpm run test -- --run

lint-frontend:
	cd frontend && pnpm run lint
