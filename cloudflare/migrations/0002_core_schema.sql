CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    channel_title TEXT,
    channel_url TEXT,
    channel_thumbnail_url TEXT,
    channel_updated_at TEXT,
    credentials_json TEXT,
    credentials_updated_at TEXT,
    credentials_error TEXT,
    oauth_state TEXT,
    oauth_state_created_at TEXT,
    smart_update_interval_hours INTEGER,
    show_archived INTEGER,
    activity_feed_sort_date TEXT,
    today_entries_enabled INTEGER,
    today_include_previous_incomplete INTEGER,
    today_move_completed_to_end INTEGER,
    accent_color TEXT
);

CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    prompt_body TEXT,
    prompt_format TEXT,
    occurred_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_smart_update_at TEXT,
    last_opened_at TEXT,
    category TEXT NOT NULL,
    link_url TEXT,
    thumbnail_url TEXT,
    video_id TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    attachments TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    extracted_text TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON entries(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_archived ON entries(archived);
CREATE INDEX IF NOT EXISTS idx_entries_video_id ON entries(video_id);
CREATE INDEX IF NOT EXISTS idx_turns_conversation_created_at ON turns(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
