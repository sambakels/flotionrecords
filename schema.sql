-- Flotion Mastering — D1 schema
-- Apply with: wrangler d1 execute flotion-mastering --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    email_verified  INTEGER NOT NULL DEFAULT 0,
    free_used       INTEGER NOT NULL DEFAULT 0,
    credits_balance INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS verify_tokens (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    purpose     TEXT NOT NULL,           -- 'signup' or 'signin'
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_verify_user ON verify_tokens(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    tier            TEXT NOT NULL,        -- 'free', 'single', 'pack'
    genre           TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    source_r2_key   TEXT NOT NULL,
    status          TEXT NOT NULL,        -- 'pending', 'processing', 'done', 'failed'
    result_mp3_key  TEXT,
    result_wav_key  TEXT,
    result_source_mp3_key TEXT,
    wav_unlocked    INTEGER NOT NULL DEFAULT 0,
    report_json     TEXT,                 -- analysis report
    error_message   TEXT,
    stripe_session_id TEXT,
    created_at      TEXT NOT NULL,
    started_at      TEXT,
    finished_at     TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Redeemable WAV download codes (bundle purchases, emailed to buyer)
CREATE TABLE IF NOT EXISTS codes (
    code         TEXT PRIMARY KEY,
    used         INTEGER NOT NULL DEFAULT 0,
    used_job_id  TEXT,
    email        TEXT,
    created_at   TEXT NOT NULL,
    used_at      TEXT
);
