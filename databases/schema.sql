CREATE SEQUENCE IF NOT EXISTS links_id_seq START 10000;


CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY DEFAULT nextval('links_id_seq'),
    original_url TEXT NOT NULL,
    short_code VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para que FastAPI encuentre la URL al instante
CREATE INDEX IF NOT EXISTS ix_links_short_code ON links (short_code);
CREATE INDEX IF NOT EXISTS ix_links_id ON links (id);

-- 3. Tabla de telemetría (Clics)
CREATE TABLE IF NOT EXISTS clicks (
    id SERIAL PRIMARY KEY,
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    referer TEXT
);

CREATE INDEX IF NOT EXISTS ix_clicks_link_id ON clicks (link_id);
CREATE INDEX IF NOT EXISTS ix_clicks_clicked_at ON clicks (clicked_at);