CREATE TABLE IF NOT EXISTS diagnostics_roundtrips (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
