from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

from workers import Request, Response, WorkerEntrypoint, fetch


def _read_query_rows(query_result):
    if isinstance(query_result, dict):
        rows = query_result.get("results")
        if isinstance(rows, list):
            return rows
    rows = getattr(query_result, "results", None)
    if isinstance(rows, list):
        return rows
    return []


def _read_row_value(row, key: str):
    if isinstance(row, dict):
        return row.get(key)
    return getattr(row, key, None)


def _json_response(payload, status: int = 200) -> Response:
    return Response.from_json(payload, status=status)


def _extract_model_output(payload: dict) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""
    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content
    return ""


class Default(WorkerEntrypoint):
    async def fetch(self, request: Request) -> Response:
        method = request.method.value
        parsed_url = urlparse(request.url)
        path = parsed_url.path

        if path.startswith("/api/"):
            return await self._proxy_backend(request, parsed_url)

        if method == "GET" and path in {"/health", "/cloud/health"}:
            return _json_response(
                {
                    "status": "ok",
                    "service": "storyloop",
                    "env": "cloudflare-workers-python",
                }
            )

        if method == "GET" and path == "/":
            return _json_response(
                {
                    "status": "ok",
                    "service": "storyloop",
                    "message": "Cloudflare worker is running.",
                    "endpoints": {
                        "health": "/health",
                        "d1_roundtrip": "/diagnostics/d1-roundtrip",
                        "sse": "/diagnostics/sse",
                        "model_probe": "/diagnostics/model-probe",
                    },
                }
            )

        if method == "POST" and path in {
            "/diagnostics/d1-roundtrip",
            "/cloud/diagnostics/d1-roundtrip",
        }:
            return await self._d1_roundtrip(request)

        if method == "GET" and path in {"/diagnostics/sse", "/cloud/diagnostics/sse"}:
            return self._sse_response()

        if method == "POST" and path in {
            "/diagnostics/model-probe",
            "/cloud/diagnostics/model-probe",
        }:
            return await self._model_probe(request)

        if method == "POST" and path in {"/assets/blob", "/cloud/assets/blob"}:
            return await self._blob_put(request)

        for prefix in ("/assets/blob/", "/cloud/assets/blob/"):
            if method == "GET" and path.startswith(prefix):
                object_key = path[len(prefix) :]
                if not object_key:
                    return _json_response(
                        {"ok": False, "reason": "missing_object_key"},
                        status=400,
                    )
                return await self._blob_get(object_key)

        return _json_response(
            {"ok": False, "reason": "not_found", "path": path},
            status=404,
        )

    async def _proxy_backend(self, request: Request, parsed_url) -> Response:
        backend_origin = str(getattr(self.env, "BACKEND_ORIGIN", "")).strip().rstrip("/")
        if not backend_origin:
            return _json_response(
                {
                    "ok": False,
                    "reason": "missing_backend_origin",
                    "message": "Set BACKEND_ORIGIN in wrangler vars to proxy /api/* to backend.",
                },
                status=503,
            )

        if backend_origin.startswith("https://mystoryloop.com") or backend_origin.startswith(
            "http://mystoryloop.com"
        ):
            return _json_response(
                {
                    "ok": False,
                    "reason": "invalid_backend_origin",
                    "message": "BACKEND_ORIGIN cannot point to mystoryloop.com or it may recurse.",
                },
                status=500,
            )

        upstream_path = parsed_url.path[len("/api") :] or "/"
        upstream_url = f"{backend_origin}{upstream_path}"
        if parsed_url.query:
            upstream_url = f"{upstream_url}?{parsed_url.query}"

        headers = {key: value for key, value in request.headers.items()}
        headers.pop("host", None)
        headers["x-forwarded-host"] = parsed_url.netloc
        headers["x-forwarded-proto"] = parsed_url.scheme

        body = None
        if request.method.value not in {"GET", "HEAD"}:
            body = request.body

        try:
            return await fetch(
                upstream_url,
                method=request.method.value,
                headers=headers,
                body=body,
            )
        except Exception as exc:
            return _json_response(
                {
                    "ok": False,
                    "reason": "backend_proxy_failed",
                    "error_type": type(exc).__name__,
                },
                status=502,
            )

    async def _d1_roundtrip(self, request: Request) -> Response:
        try:
            body = await request.json()
        except Exception:
            body = {}

        payload = body.get("payload") if isinstance(body, dict) else None
        if payload is None:
            payload = {"source": "diagnostics"}
        if not isinstance(payload, dict):
            return _json_response(
                {"ok": False, "reason": "invalid_payload", "message": "payload must be an object"},
                status=400,
            )

        record_id = uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()
        payload_json = json.dumps(payload, sort_keys=True)

        try:
            await self.env.DB.prepare(
                """
                INSERT INTO diagnostics_roundtrips (id, payload_json, created_at)
                VALUES (?1, ?2, ?3)
                """
            ).bind(record_id, payload_json, created_at).run()
            query_result = await self.env.DB.prepare(
                """
                SELECT id, payload_json, created_at
                FROM diagnostics_roundtrips
                WHERE id = ?1
                """
            ).bind(record_id).run()
        except Exception as exc:
            return _json_response(
                {
                    "ok": False,
                    "reason": "d1_roundtrip_failed",
                    "error_type": type(exc).__name__,
                },
                status=500,
            )

        rows = _read_query_rows(query_result)
        if not rows:
            return _json_response(
                {"ok": False, "reason": "d1_row_not_found_after_insert"},
                status=500,
            )

        row = rows[0]
        selected_payload = _read_row_value(row, "payload_json")
        if isinstance(selected_payload, str):
            try:
                selected_payload = json.loads(selected_payload)
            except json.JSONDecodeError:
                pass

        return _json_response(
            {
                "ok": True,
                "inserted": {"id": record_id, "payload": payload, "created_at": created_at},
                "selected": {
                    "id": _read_row_value(row, "id") or record_id,
                    "payload": selected_payload,
                    "created_at": _read_row_value(row, "created_at") or created_at,
                },
            }
        )

    def _sse_response(self) -> Response:
        events = [
            'event: start\ndata: {"status":"ok"}\n\n',
            'event: token\ndata: {"index":0,"token":"storyloop"}\n\n',
            'event: token\ndata: {"index":1,"token":"cloudflare"}\n\n',
            'event: token\ndata: {"index":2,"token":"sse"}\n\n',
            'event: done\ndata: {"status":"complete"}\n\n',
        ]
        return Response(
            "".join(events),
            headers={
                "content-type": "text/event-stream",
                "cache-control": "no-cache",
                "x-accel-buffering": "no",
            },
        )

    async def _model_probe(self, request: Request) -> Response:
        try:
            body = await request.json()
        except Exception:
            body = {}

        if not isinstance(body, dict):
            body = {}

        api_key = getattr(self.env, "OPENAI_API_KEY", None)
        if not api_key:
            return _json_response(
                {
                    "ok": False,
                    "reason": "missing_openai_api_key",
                    "message": "Configure OPENAI_API_KEY with wrangler secret put OPENAI_API_KEY.",
                },
                status=412,
            )

        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            prompt = "Respond with exactly the word: ok."

        model = body.get("model")
        if not isinstance(model, str) or not model.strip():
            model = str(getattr(self.env, "MODEL_PROBE_MODEL", "gpt-4o-mini"))

        max_tokens = body.get("max_tokens")
        if not isinstance(max_tokens, int) or max_tokens < 1 or max_tokens > 128:
            max_tokens = 32

        base_url = str(getattr(self.env, "MODEL_PROBE_BASE_URL", "https://api.openai.com/v1")).rstrip("/")
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": "You are a short diagnostic probe."},
                {"role": "user", "content": prompt},
            ],
        }

        try:
            response = await fetch(
                f"{base_url}/chat/completions",
                method="POST",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                body=json.dumps(payload),
            )
        except Exception as exc:
            return _json_response(
                {
                    "ok": False,
                    "reason": "upstream_request_failed",
                    "error_type": type(exc).__name__,
                },
                status=502,
            )

        response_text = await response.text()
        if response.status >= 400:
            return _json_response(
                {
                    "ok": False,
                    "reason": "upstream_error",
                    "status_code": response.status,
                    "body_preview": response_text[:240],
                },
                status=502,
            )

        try:
            response_json = json.loads(response_text)
        except json.JSONDecodeError:
            return _json_response(
                {"ok": False, "reason": "invalid_upstream_json"},
                status=502,
            )

        return _json_response(
            {
                "ok": True,
                "model": model,
                "output_preview": _extract_model_output(response_json)[:200],
                "has_choices": isinstance(response_json.get("choices"), list),
                "usage": response_json.get("usage"),
            }
        )

    async def _blob_put(self, request: Request) -> Response:
        bucket = getattr(self.env, "ASSETS_BUCKET", None)
        if bucket is None:
            return _json_response(
                {
                    "ok": False,
                    "reason": "missing_assets_bucket",
                    "message": "Enable R2, add ASSETS_BUCKET binding, and redeploy.",
                },
                status=503,
            )

        data = await request.bytes()
        if not data:
            return _json_response(
                {"ok": False, "reason": "empty_blob_payload"},
                status=400,
            )

        digest = hashlib.sha256(data).hexdigest()
        object_key = f"assets/{digest}"

        try:
            await bucket.put(object_key, data)
        except Exception as exc:
            return _json_response(
                {
                    "ok": False,
                    "reason": "r2_upload_failed",
                    "error_type": type(exc).__name__,
                },
                status=500,
            )

        return _json_response(
            {
                "ok": True,
                "key": object_key,
                "sha256": digest,
                "size_bytes": len(data),
            }
        )

    async def _blob_get(self, object_key: str) -> Response:
        bucket = getattr(self.env, "ASSETS_BUCKET", None)
        if bucket is None:
            return _json_response(
                {
                    "ok": False,
                    "reason": "missing_assets_bucket",
                    "message": "Enable R2, add ASSETS_BUCKET binding, and redeploy.",
                },
                status=503,
            )

        try:
            obj = await bucket.get(object_key)
        except Exception as exc:
            return _json_response(
                {
                    "ok": False,
                    "reason": "r2_read_failed",
                    "error_type": type(exc).__name__,
                },
                status=500,
            )

        if obj is None:
            return _json_response(
                {"ok": False, "reason": "blob_not_found"},
                status=404,
            )

        http_metadata = getattr(obj, "httpMetadata", None)
        content_type = "application/octet-stream"
        if http_metadata is not None:
            metadata_type = getattr(http_metadata, "contentType", None)
            if isinstance(metadata_type, str) and metadata_type:
                content_type = metadata_type

        headers = {"content-type": content_type}
        etag = getattr(obj, "httpEtag", None)
        if isinstance(etag, str) and etag:
            headers["etag"] = etag

        body_stream = getattr(obj, "body", None)
        if body_stream is None:
            return Response(await obj.text(), headers=headers)
        return Response(body_stream, headers=headers)
