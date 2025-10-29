.PHONY: dev backend test test-backend test-frontend lint-frontend

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev:
	python scripts/dev.py

test:
	make test-backend
	make test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm run test -- --run

lint-frontend:
	cd frontend && npm run lint
