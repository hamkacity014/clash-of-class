-- ==============================================================================
-- CLASH OF CLASS — DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Salin seluruh isi skrip ini ke SQL Editor di Dashboard Supabase Anda
-- ==============================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Hapus tabel lama jika ada (untuk migrasi bersih)
DROP FUNCTION IF EXISTS claim_question_lock;
DROP TABLE IF EXISTS room_questions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- 3. Tabel Rooms (Sesi Game Guru)
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(6) UNIQUE NOT NULL,
    teacher_name VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    mode VARCHAR(20) DEFAULT 'INDIVIDUAL', -- 'INDIVIDUAL' | 'TEAM'
    status VARCHAR(20) DEFAULT 'WAITING',   -- 'WAITING' | 'ACTIVE' | 'FINISHED'
    lock_duration INT DEFAULT 60,           -- Durasi lock soal dalam detik (default 60s)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pencarian cepat berdasarkan kode room
CREATE INDEX idx_rooms_code ON rooms(code);

-- 4. Tabel Teams (Jika Mode Kelompok)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    team_name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#06B6D4',
    total_score INT DEFAULT 0
);

-- 5. Tabel Participants (Siswa)
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    score INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabel Questions (Bank Soal Master)
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,                 -- [{"label": "A", "text": "Jawaban A"}, ...]
    correct_answer VARCHAR(10) NOT NULL,    -- "A", "B", "C", atau "D"
    points INT DEFAULT 100,                 -- 100, 200, 300
    order_index INT NOT NULL
);

-- 7. Tabel Room Questions (Status Live Soal di Papan Arena)
CREATE TABLE room_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE' | 'LOCKED' | 'SOLVED'
    locked_by_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    locked_by_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    locked_by_name VARCHAR(100),
    locked_at TIMESTAMP WITH TIME ZONE,
    lock_expires_at TIMESTAMP WITH TIME ZONE,
    solved_by_name VARCHAR(100)
);

-- 8. Stored Procedure Atomic Locking (Anti-Race Condition)
CREATE OR REPLACE FUNCTION claim_question_lock(
    p_room_question_id UUID,
    p_participant_id UUID,
    p_team_id UUID,
    p_participant_name VARCHAR,
    p_lock_duration_seconds INT DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
    v_updated INT;
BEGIN
    -- Atomic update: Hanya berhasil jika status AVAILABLE atau lock lama sudah expired
    UPDATE room_questions
    SET status = 'LOCKED',
        locked_by_participant_id = p_participant_id,
        locked_by_team_id = p_team_id,
        locked_by_name = p_participant_name,
        locked_at = NOW(),
        lock_expires_at = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
    WHERE id = p_room_question_id 
      AND (
          status = 'AVAILABLE' 
          OR (status = 'LOCKED' AND lock_expires_at < NOW())
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- 9. Aktifkan Supabase Realtime untuk tabel publik
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE room_questions;
