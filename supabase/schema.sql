-- ==============================================================================
-- CLASH OF CLASS — DATABASE SCHEMA & OPTIMIZATION (SUPABASE POSTGRESQL)
-- Salin seluruh isi skrip ini ke SQL Editor di Dashboard Supabase Anda
-- ==============================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop function lama jika ada untuk mencegah error:
-- "ERROR: 42P13: cannot change return type of existing function"
DROP FUNCTION IF EXISTS claim_question_lock CASCADE;
DROP FUNCTION IF EXISTS claim_question_lock(UUID, UUID, UUID, VARCHAR, INT) CASCADE;
DROP FUNCTION IF EXISTS submit_answer_atomic CASCADE;
DROP FUNCTION IF EXISTS submit_answer_atomic(UUID, UUID, UUID, TEXT, VARCHAR) CASCADE;

-- 3. Tabel Rooms (Sesi Game Guru)
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(6) UNIQUE NOT NULL,
    teacher_name VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    mode VARCHAR(20) DEFAULT 'INDIVIDUAL', -- 'INDIVIDUAL' | 'TEAM'
    status VARCHAR(20) DEFAULT 'WAITING',   -- 'WAITING' | 'ACTIVE' | 'FINISHED'
    lock_duration INT DEFAULT 60,           -- Durasi lock soal dalam detik (default 60s)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabel Teams (Jika Mode Kelompok)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    team_name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#06B6D4',
    total_score INT DEFAULT 0
);

-- 5. Tabel Participants (Siswa)
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    team_name VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    score INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabel Questions (Bank Soal Master)
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'MULTIPLE_CHOICE', -- 'MULTIPLE_CHOICE' | 'ESSAY'
    question_text TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"label": "A", "text": "Jawaban A"}, ...]
    correct_answer TEXT NOT NULL,               -- "A", "B", "C", "D" atau kata kunci essay
    points INT DEFAULT 100,                     -- 100, 200, 300
    order_index INT NOT NULL,
    explanation TEXT                            -- Pembahasan edukatif
);

-- 7. Tabel Room Questions (Status Live Soal di Papan Arena)
CREATE TABLE IF NOT EXISTS room_questions (
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

-- 8. Tambahkan kolom skema pendukung jika tabel sudah ada sebelumnya
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lock_duration INT DEFAULT 60;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'MULTIPLE_CHOICE';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS team_name VARCHAR(50);

-- 9. INDEX UNTUK PERFORMA QUERY (Mencegah Full Table Scan & Menghilangkan Lag di HP Siswa)
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_room_questions_room_id ON room_questions(room_id);
CREATE INDEX IF NOT EXISTS idx_room_questions_room_status ON room_questions(room_id, status);
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_teams_room_id ON teams(room_id);
CREATE INDEX IF NOT EXISTS idx_questions_room_id ON questions(room_id);

-- 10. Stored Procedure Atomic Locking (Anti-Race Condition 100%)
CREATE OR REPLACE FUNCTION claim_question_lock(
    p_room_question_id UUID,
    p_participant_id UUID,
    p_team_id UUID,
    p_participant_name VARCHAR,
    p_lock_duration_seconds INT DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
    v_updated INT;
    v_expires_at TIMESTAMP WITH TIME ZONE;
    v_existing_locker VARCHAR;
    v_status VARCHAR;
BEGIN
    SELECT status, locked_by_name INTO v_status, v_existing_locker
    FROM room_questions WHERE id = p_room_question_id;

    IF v_status = 'SOLVED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_SOLVED', 'message', 'Soal sudah berhasil dijawab peserta lain!');
    END IF;

    v_expires_at := NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL;

    UPDATE room_questions
    SET status = 'LOCKED',
        locked_by_participant_id = p_participant_id,
        locked_by_team_id = p_team_id,
        locked_by_name = p_participant_name,
        locked_at = NOW(),
        lock_expires_at = v_expires_at
    WHERE id = p_room_question_id 
      AND (
          status = 'AVAILABLE' 
          OR (status = 'LOCKED' AND (lock_expires_at IS NULL OR lock_expires_at < NOW()))
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
        RETURN jsonb_build_object(
            'success', true, 
            'expires_at', v_expires_at, 
            'message', 'Berhasil mengunci soal!'
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false, 
            'reason', 'RACE_LOST', 
            'message', COALESCE('Soal baru saja direbut oleh ' || v_existing_locker, 'Soal sedang dikunci peserta lain!')
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 11. Stored Procedure Atomik untuk Submit Jawaban & Update Skor (Anti-Lost Update)
CREATE OR REPLACE FUNCTION submit_answer_atomic(
    p_room_question_id UUID,
    p_participant_id UUID,
    p_team_id UUID,
    p_selected_answer TEXT,
    p_solver_name VARCHAR
) RETURNS JSONB AS $$
DECLARE
    v_question_id UUID;
    v_correct_answer TEXT;
    v_points INT;
    v_q_type VARCHAR;
    v_is_correct BOOLEAN := FALSE;
    v_status VARCHAR;
BEGIN
    SELECT rq.question_id, rq.status, q.correct_answer, q.points, COALESCE(q.type, 'MULTIPLE_CHOICE')
    INTO v_question_id, v_status, v_correct_answer, v_points, v_q_type
    FROM room_questions rq
    JOIN questions q ON q.id = rq.question_id
    WHERE rq.id = p_room_question_id;

    IF v_status = 'SOLVED' THEN
        RETURN jsonb_build_object('correct', false, 'points_awarded', 0, 'message', 'Soal sudah diselesaikan sebelumnya.');
    END IF;

    -- Evaluasi jawaban langsung di server Supabase
    IF v_q_type = 'ESSAY' THEN
        v_is_correct := (LOWER(TRIM(p_selected_answer)) = LOWER(TRIM(v_correct_answer)));
    ELSE
        v_is_correct := (UPPER(TRIM(p_selected_answer)) = UPPER(TRIM(v_correct_answer)));
    END IF;

    IF v_is_correct THEN
        -- JAWABAN BENAR
        UPDATE room_questions
        SET status = 'SOLVED',
            solved_by_name = p_solver_name,
            lock_expires_at = NULL
        WHERE id = p_room_question_id;

        -- Tambah skor peserta secara atomik
        UPDATE participants
        SET score = score + v_points
        WHERE id = p_participant_id;

        -- Tambah skor tim secara atomik jika ada
        IF p_team_id IS NOT NULL THEN
            UPDATE teams
            SET total_score = total_score + v_points
            WHERE id = p_team_id;
        END IF;

        RETURN jsonb_build_object(
            'correct', true, 
            'points_awarded', v_points,
            'correct_answer', v_correct_answer
        );
    ELSE
        -- JAWABAN SALAH: Kembalikan soal menjadi AVAILABLE
        UPDATE room_questions
        SET status = 'AVAILABLE',
            locked_by_participant_id = NULL,
            locked_by_team_id = NULL,
            locked_by_name = NULL,
            locked_at = NULL,
            lock_expires_at = NULL
        WHERE id = p_room_question_id;

        RETURN jsonb_build_object(
            'correct', false, 
            'points_awarded', 0
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 12. Nonaktifkan RLS agar akses kuis publik tetap instan
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_questions DISABLE ROW LEVEL SECURITY;

-- 13. Muat ulang cache schema PostgREST agar kolom & RPC langsung aktif
NOTIFY pgrst, 'reload schema';
