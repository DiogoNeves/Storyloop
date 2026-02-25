from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import quote, urlparse
from uuid import uuid4

from workers import Request, Response, WorkerEntrypoint, fetch

_ASSET_ID_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_TEXT_ASSET_MIME_TYPES = frozenset(
    {
        "text/plain",
        "text/srt",
        "text/x-subrip",
        "application/x-subrip",
    }
)


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


def _is_asset_id(value: str) -> bool:
    return bool(_ASSET_ID_PATTERN.fullmatch(value))


def _normalize_asset_content_type(content_type: str, filename: str) -> str | None:
    normalized = content_type.lower().split(";", 1)[0].strip()
    if normalized.startswith("image/"):
        return normalized
    if normalized == "application/pdf":
        return normalized
    if normalized in _TEXT_ASSET_MIME_TYPES:
        return normalized
    if normalized in {"application/octet-stream", ""}:
        suffix = ""
        if "." in filename:
            suffix = filename.rsplit(".", 1)[1].lower()
        if suffix in {"txt", "text"}:
            return "text/plain"
        if suffix == "srt":
            return "application/x-subrip"
    return None


def _asset_markdown(filename: str, asset_id: str, mime_type: str) -> str:
    url = f"/assets/{asset_id}"
    safe_label = filename or "asset"
    if mime_type.startswith("image/"):
        return f"![{safe_label}]({url})"
    return f"[{safe_label}]({url})"


def _to_bytes(payload) -> bytes | None:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, bytearray):
        return bytes(payload)

    to_bytes = getattr(payload, "to_bytes", None)
    if callable(to_bytes):
        try:
            coerced = to_bytes()
            if isinstance(coerced, bytes):
                return coerced
            if isinstance(coerced, bytearray):
                return bytes(coerced)
        except Exception:
            pass

    try:
        coerced = bytes(payload)
        if coerced:
            return coerced
    except Exception:
        pass

    try:
        from js import Uint8Array

        view = Uint8Array.new(payload)
        py_view = view.to_py()
        if isinstance(py_view, memoryview):
            return py_view.tobytes()
        if isinstance(py_view, bytearray):
            return bytes(py_view)
        if isinstance(py_view, bytes):
            return py_view
        return bytes(py_view)
    except Exception:
        return None


class Default(WorkerEntrypoint):
    async def fetch(self, request: Request) -> Response:
        method = request.method.value
        parsed_url = urlparse(request.url)
        path = parsed_url.path

        if path.startswith("/api/assets"):
            return await self._handle_api_assets(request, path)

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
                        "asset_upload_api": "/api/assets",
                        "asset_meta_api": "/api/assets/{id}/meta",
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
                    "message": "Set BACKEND_ORIGIN in wrangler secret/vars to proxy /api/* to backend.",
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

    async def _handle_api_assets(self, request: Request, path: str) -> Response:
        if getattr(self.env, "ASSETS_BUCKET", None) is None:
            return await self._proxy_backend(request, urlparse(request.url))

        method = request.method.value
        if method == "POST" and path == "/api/assets":
            return await self._api_asset_upload(request, expected_hash=None)

        if not path.startswith("/api/assets/"):
            return _json_response({"ok": False, "reason": "not_found"}, status=404)

        suffix = path[len("/api/assets/") :].strip("/")
        if not suffix:
            return _json_response({"ok": False, "reason": "missing_asset_id"}, status=400)

        if method == "GET" and suffix.endswith("/meta"):
            asset_id = suffix[:-5].strip("/")
            return await self._api_asset_meta(asset_id)

        if method == "GET":
            return await self._api_asset_get(suffix)

        if method == "POST":
            return await self._api_asset_upload(request, expected_hash=suffix)

        return _json_response({"ok": False, "reason": "method_not_allowed"}, status=405)

    async def _api_asset_upload(self, request: Request, expected_hash: str | None) -> Response:
        if expected_hash is not None and not _is_asset_id(expected_hash):
            return _json_response({"ok": False, "reason": "invalid_asset_id"}, status=400)

        db = getattr(self.env, "DB", None)
        bucket = getattr(self.env, "ASSETS_BUCKET", None)
        if db is None:
            return _json_response(
                {"ok": False, "reason": "missing_db_binding", "message": "Bind D1 as DB."},
                status=503,
            )
        if bucket is None:
            return _json_response(
                {
                    "ok": False,
                    "reason": "missing_assets_bucket",
                    "message": "Enable R2 and bind ASSETS_BUCKET before uploading assets.",
                },
                status=503,
            )

        content_type_header = str(request.headers.get("content-type", "")).lower()
        if "multipart/form-data" not in content_type_header:
            return _json_response(
                {
                    "ok": False,
                    "reason": "invalid_content_type",
                    "message": "Use multipart/form-data with a single 'file' field.",
                },
                status=400,
            )

        form_data = await self._request_form_data(request)
        if form_data is None:
            return _json_response(
                {"ok": False, "reason": "invalid_form_data"},
                status=400,
            )

        uploaded = None
        get_method = getattr(form_data, "get", None)
        if callable(get_method):
            uploaded = get_method("file")
        if uploaded is None:
            return _json_response(
                {"ok": False, "reason": "missing_file_field"},
                status=400,
            )

        original_filename = str(getattr(uploaded, "name", "") or "upload")
        detected_mime = str(getattr(uploaded, "type", "") or "")
        normalized_mime = _normalize_asset_content_type(detected_mime, original_filename)
        if normalized_mime is None:
            return _json_response(
                {
                    "ok": False,
                    "reason": "unsupported_file_type",
                    "message": "Only images, PDFs, and text/SRT files are supported.",
                },
                status=400,
            )

        data = await self._read_blob_bytes(uploaded)
        if not data:
            return _json_response({"ok": False, "reason": "empty_blob_payload"}, status=400)

        asset_id = hashlib.sha256(data).hexdigest()
        if expected_hash is not None and expected_hash != asset_id:
            return _json_response(
                {"ok": False, "reason": "hash_mismatch", "expected": expected_hash, "actual": asset_id},
                status=400,
            )

        query_result = await db.prepare(
            """
            SELECT id, original_filename, mime_type, size_bytes
            FROM assets
            WHERE id = ?1
            """
        ).bind(asset_id).run()
        rows = _read_query_rows(query_result)
        already_exists = bool(rows)

        if not already_exists:
            created_at = datetime.now(timezone.utc).isoformat()
            await bucket.put(f"assets/{asset_id}", data)
            await db.prepare(
                """
                INSERT INTO assets (
                    id,
                    original_filename,
                    mime_type,
                    created_at,
                    extracted_text,
                    size_bytes
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                """
            ).bind(
                asset_id,
                original_filename,
                normalized_mime,
                created_at,
                None,
                len(data),
            ).run()
            filename_for_response = original_filename
            mime_for_response = normalized_mime
            size_bytes = len(data)
        else:
            row = rows[0]
            filename_for_response = str(_read_row_value(row, "original_filename") or original_filename)
            mime_for_response = str(_read_row_value(row, "mime_type") or normalized_mime)
            parsed_size = _read_row_value(row, "size_bytes")
            if isinstance(parsed_size, int):
                size_bytes = parsed_size
            else:
                size_bytes = len(data)

        return _json_response(
            {
                "id": asset_id,
                "url": f"/assets/{asset_id}",
                "filename": filename_for_response,
                "mimeType": mime_for_response,
                "sizeBytes": size_bytes,
                "width": None,
                "height": None,
                "markdown": _asset_markdown(filename_for_response, asset_id, mime_for_response),
                "alreadyExists": already_exists,
            }
        )

    async def _api_asset_get(self, asset_id: str) -> Response:
        if not _is_asset_id(asset_id):
            return _json_response({"ok": False, "reason": "invalid_asset_id"}, status=400)

        bucket = getattr(self.env, "ASSETS_BUCKET", None)
        if bucket is None:
            return _json_response(
                {"ok": False, "reason": "missing_assets_bucket"},
                status=503,
            )

        db = getattr(self.env, "DB", None)
        row = None
        if db is not None:
            query_result = await db.prepare(
                """
                SELECT original_filename, mime_type
                FROM assets
                WHERE id = ?1
                """
            ).bind(asset_id).run()
            rows = _read_query_rows(query_result)
            row = rows[0] if rows else None

        obj = await bucket.get(f"assets/{asset_id}")
        if obj is None:
            return _json_response({"ok": False, "reason": "blob_not_found"}, status=404)

        content_type = "application/octet-stream"
        if row is not None:
            db_type = _read_row_value(row, "mime_type")
            if isinstance(db_type, str) and db_type:
                content_type = db_type
        else:
            http_metadata = getattr(obj, "httpMetadata", None)
            if http_metadata is not None:
                metadata_type = getattr(http_metadata, "contentType", None)
                if isinstance(metadata_type, str) and metadata_type:
                    content_type = metadata_type

        headers = {"content-type": content_type}
        filename = None
        if row is not None:
            db_name = _read_row_value(row, "original_filename")
            if isinstance(db_name, str) and db_name:
                filename = db_name
        if filename:
            headers["content-disposition"] = f"inline; filename*=UTF-8''{quote(filename)}"

        etag = getattr(obj, "httpEtag", None)
        if isinstance(etag, str) and etag:
            headers["etag"] = etag

        body_stream = getattr(obj, "body", None)
        if body_stream is None:
            return Response(await obj.text(), headers=headers)
        return Response(body_stream, headers=headers)

    async def _api_asset_meta(self, asset_id: str) -> Response:
        if not _is_asset_id(asset_id):
            return _json_response({"ok": False, "reason": "invalid_asset_id"}, status=400)

        db = getattr(self.env, "DB", None)
        if db is None:
            return _json_response(
                {"ok": False, "reason": "missing_db_binding"},
                status=503,
            )

        query_result = await db.prepare(
            """
            SELECT id, original_filename, mime_type, size_bytes
            FROM assets
            WHERE id = ?1
            """
        ).bind(asset_id).run()
        rows = _read_query_rows(query_result)
        if not rows:
            return _json_response({"ok": False, "reason": "asset_not_found"}, status=404)

        row = rows[0]
        size_value = _read_row_value(row, "size_bytes")
        size_bytes = int(size_value) if isinstance(size_value, int) else 0
        return _json_response(
            {
                "id": _read_row_value(row, "id") or asset_id,
                "filename": _read_row_value(row, "original_filename") or "asset",
                "mimeType": _read_row_value(row, "mime_type") or "application/octet-stream",
                "sizeBytes": size_bytes,
                "width": None,
                "height": None,
            }
        )

    async def _request_form_data(self, request: Request):
        form_data_method = getattr(request, "form_data", None)
        if callable(form_data_method):
            try:
                return await form_data_method()
            except Exception:
                pass

        form_data_method = getattr(request, "formData", None)
        if callable(form_data_method):
            try:
                return await form_data_method()
            except Exception:
                return None
        return None

    async def _read_blob_bytes(self, blob) -> bytes:
        bytes_method = getattr(blob, "bytes", None)
        if callable(bytes_method):
            data = _to_bytes(await bytes_method())
            if data is not None:
                return data

        array_buffer_method = getattr(blob, "array_buffer", None)
        if not callable(array_buffer_method):
            array_buffer_method = getattr(blob, "arrayBuffer", None)
        if callable(array_buffer_method):
            data = _to_bytes(await array_buffer_method())
            if data is not None:
                return data

        text_method = getattr(blob, "text", None)
        if callable(text_method):
            text_payload = await text_method()
            return str(text_payload).encode("utf-8")

        return b""

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
