-- Firewall Siege — схема БД (SQLite)
CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,          -- учебно: открытый текст (слабость)
    token      TEXT NOT NULL,          -- слабый токен (V4)
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    score      INTEGER NOT NULL,
    wave       INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
