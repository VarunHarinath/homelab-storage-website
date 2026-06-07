-- PostgreSQL DB initialization schema for Homelab Storage Portal

-- Enable pgcrypto extension for gen_random_uuid() if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table to store local credentials
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Idempotently rename clerk_user_id to user_id in files table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='files' AND column_name='clerk_user_id'
    ) THEN
        ALTER TABLE files RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

-- Create files table to track file metadata if not exists
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    filepath VARCHAR(512) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index user_id for faster lookup of a user's files
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);

-- Optional: Index on file name to speed up search filtering if dataset grows
CREATE INDEX IF NOT EXISTS idx_files_name ON files (original_name);
