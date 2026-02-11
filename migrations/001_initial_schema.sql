-- Migration: 001_initial_schema.sql

CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  execution_id VARCHAR(100),
  token_address VARCHAR(42) UNIQUE,
  token_name VARCHAR(100),
  token_symbol VARCHAR(20),
  pool_address VARCHAR(42),
  tx_hash VARCHAR(66),
  trend_topic VARCHAR(200),
  region VARCHAR(50),
  initial_eth NUMERIC,
  initial_tokens NUMERIC,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trends (
  id SERIAL PRIMARY KEY,
  topic VARCHAR(200),
  region VARCHAR(50),
  volume INT,
  confidence NUMERIC,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id SERIAL PRIMARY KEY,
  execution_id VARCHAR(100),
  stage VARCHAR(50),
  status VARCHAR(20),
  message TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
