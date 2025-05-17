-- 初始化PostgreSQL表结构
-- 交易表
CREATE TABLE IF NOT EXISTS "__dubheStoreTransactions" (
    id SERIAL PRIMARY KEY, 
    sender TEXT NOT NULL, 
    checkpoint INTEGER NOT NULL, 
    digest TEXT NOT NULL, 
    package TEXT NOT NULL,
    module TEXT NOT NULL,
    function TEXT NOT NULL,
    arguments JSONB NOT NULL,
    cursor TEXT NOT NULL, 
    created_at TEXT NOT NULL
);

-- Schema表
CREATE TABLE IF NOT EXISTS "__dubheStoreSchemas" (
    id SERIAL PRIMARY KEY,
    last_update_checkpoint TEXT NOT NULL,
    last_update_digest TEXT NOT NULL,
    name TEXT NOT NULL,
    key1 JSONB,
    key2 JSONB,
    value JSONB NOT NULL,
    is_removed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 事件表
CREATE TABLE IF NOT EXISTS "__dubheStoreEvents" (
    id SERIAL PRIMARY KEY,
    sender TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    digest TEXT NOT NULL,
    name TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TEXT NOT NULL
);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_transactions_digest ON "__dubheStoreTransactions" (digest);
CREATE INDEX IF NOT EXISTS idx_transactions_sender ON "__dubheStoreTransactions" (sender);
CREATE INDEX IF NOT EXISTS idx_schemas_name ON "__dubheStoreSchemas" (name);
CREATE INDEX IF NOT EXISTS idx_schemas_is_removed ON "__dubheStoreSchemas" (is_removed);
CREATE INDEX IF NOT EXISTS idx_events_name ON "__dubheStoreEvents" (name);
CREATE INDEX IF NOT EXISTS idx_events_digest ON "__dubheStoreEvents" (digest);
CREATE INDEX IF NOT EXISTS idx_events_sender ON "__dubheStoreEvents" (sender);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schemas_unique_key ON "__dubheStoreSchemas" (name, key1, key2);

-- 配置表，用于存储全局配置和元数据
CREATE TABLE IF NOT EXISTS "__dubheStoreConfig" (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 插入一些基本配置
INSERT INTO "__dubheStoreConfig" (key, value)
VALUES ('version', '"1.0.0"'),
       ('last_checkpoint', '0'),
       ('chain_id', '0')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = CURRENT_TIMESTAMP;
