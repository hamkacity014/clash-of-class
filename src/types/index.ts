export type GameMode = 'INDIVIDUAL' | 'TEAM';
export type RoomStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';
export type QuestionStatus = 'AVAILABLE' | 'LOCKED' | 'SOLVED';

export interface Room {
  id: string;
  code: string;
  teacher_name: string;
  title: string;
  mode: GameMode;
  status: RoomStatus;
  lock_duration: number; // default 60s
  created_at: string;
}

export interface Team {
  id: string;
  room_id: string;
  team_name: string;
  color: string;
  total_score: number;
}

export interface Participant {
  id: string;
  room_id: string;
  team_id?: string | null;
  team_name?: string | null;
  name: string;
  score: number;
  is_active: boolean;
  joined_at: string;
}

export interface QuestionOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface Question {
  id: string;
  room_id: string;
  question_text: string;
  options: QuestionOption[];
  correct_answer: 'A' | 'B' | 'C' | 'D';
  points: number;
  order_index: number;
  explanation?: string; // Pembahasan edukatif
}

export interface QuestionPackage {
  title: string;
  category: string;
  author?: string;
  questions: Array<{
    question_text: string;
    options: QuestionOption[];
    correct_answer: 'A' | 'B' | 'C' | 'D';
    points: number;
    explanation?: string;
  }>;
}

export interface RoomQuestion {
  id: string;
  room_id: string;
  question_id: string;
  status: QuestionStatus;
  locked_by_participant_id?: string | null;
  locked_by_team_id?: string | null;
  locked_by_name?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
  solved_by_name?: string | null;
  question?: Question;
}

export type RealtimeEventType = 
  | 'GAME_STARTED'
  | 'QUESTION_LOCKED'
  | 'QUESTION_RELEASED'
  | 'QUESTION_SOLVED'
  | 'FORCE_UNLOCKED'
  | 'PARTICIPANT_JOINED'
  | 'SCORE_UPDATED';

export interface RealtimeEventPayload {
  event: RealtimeEventType;
  room_code: string;
  room_id?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ActivityLog {
  id: string;
  text: string;
  type: 'lock' | 'release' | 'solve' | 'start' | 'info';
  timestamp: string;
}

export type LockResultStatus = 
  | 'SUCCESS' 
  | 'ALREADY_LOCKED' 
  | 'ALREADY_HAVE_LOCK' 
  | 'COOLDOWN' 
  | 'ERROR';

export interface LockResult {
  status: LockResultStatus;
  message: string;
  expires_at?: string;
}
