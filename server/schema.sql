-- PostgreSQL DB initialization schema for Homelab Storage Portal

-- Enable pgcrypto extension for gen_random_uuid() if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create files table to track file metadata
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    filepath VARCHAR(512) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index clerk_user_id for faster lookup of a user's files
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (clerk_user_id);

-- Optional: Index on file name to speed up search filtering if dataset grows
CREATE INDEX IF NOT EXISTS idx_files_name ON files (original_name);
