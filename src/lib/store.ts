import { 
  Room, 
  Question, 
  Participant, 
  Team, 
  RoomQuestion, 
  GameMode, 
  RealtimeEventPayload, 
  LockResult, 
  ActivityLog 
} from '@/types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { QUESTION_PRESETS } from './presets';

const STORAGE_PREFIX = 'clash_of_class_';

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// -------------------------------------------------------------
// BROADCAST / REAL-TIME EVENT BUS (MULTI-TAB & SUPABASE)
// -------------------------------------------------------------
const broadcastChannels: Record<string, BroadcastChannel> = {};

function getBroadcastChannel(code: string): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  const channelName = 'clash_room_' + code.toUpperCase();
  if (!broadcastChannels[channelName]) {
    try {
      broadcastChannels[channelName] = new BroadcastChannel(channelName);
    } catch {
      return null;
    }
  }
  return broadcastChannels[channelName];
}

export function broadcastRoomEvent(payload: RealtimeEventPayload) {
  // 1. Broadcast via Web BroadcastChannel (Instan multi-tab di browser)
  const bc = getBroadcastChannel(payload.room_code);
  if (bc) {
    bc.postMessage(payload);
  }

  // 2. Broadcast via Supabase Realtime jika terhubung ke cloud
  if (isSupabaseConfigured && supabase) {
    try {
      const channel = supabase.channel(`room:${payload.room_code.toUpperCase()}`);
      channel.send({
        type: 'broadcast',
        event: payload.event,
        payload,
      });
    } catch {}
  }
}

export function subscribeToRoomEvents(
  code: string,
  callback: (payload: RealtimeEventPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const cleanups: Array<() => void> = [];

  // 1. Dengar event dari BroadcastChannel lokal
  const bc = getBroadcastChannel(code);
  if (bc) {
    const handler = (event: MessageEvent) => {
      if (event.data) {
        callback(event.data as RealtimeEventPayload);
      }
    };
    bc.addEventListener('message', handler);
    cleanups.push(() => bc.removeEventListener('message', handler));
  }

  // 2. Dengar event dari Supabase Realtime
  if (isSupabaseConfigured && supabase) {
    try {
      const channel = supabase.channel(`room:${code.toUpperCase()}`);
      channel
        .on('broadcast', { event: '*' }, ({ payload }) => {
          callback(payload as RealtimeEventPayload);
        })
        .subscribe();

      cleanups.push(() => {
        supabase?.removeChannel(channel);
      });
    } catch {}
  }

  return () => {
    cleanups.forEach((c) => c());
  };
}

// -------------------------------------------------------------
// LOCAL STATE STORAGE ENGINE
// -------------------------------------------------------------
class LocalStore {
  private get<T>(key: string, defaultVal: T): T {
    if (typeof window === 'undefined') return defaultVal;
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    if (!item) return defaultVal;
    try {
      return JSON.parse(item);
    } catch {
      return defaultVal;
    }
  }

  private set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }

  saveRoom(room: Room): void {
    const rooms = this.get<Record<string, Room>>('rooms', {});
    rooms[room.code] = room;
    this.set('rooms', rooms);
  }

  getRoom(code: string): Room | null {
    const rooms = this.get<Record<string, Room>>('rooms', {});
    return rooms[code.toUpperCase()] || null;
  }

  getRoomById(roomId: string): Room | null {
    const rooms = this.get<Record<string, Room>>('rooms', {});
    return Object.values(rooms).find((r) => r.id === roomId) || null;
  }

  saveQuestions(roomId: string, questions: Question[]): void {
    const qMap = this.get<Record<string, Question[]>>('questions', {});
    qMap[roomId] = questions;
    this.set('questions', qMap);
  }

  getQuestions(roomId: string): Question[] {
    const qMap = this.get<Record<string, Question[]>>('questions', {});
    return qMap[roomId] || [];
  }

  saveTeams(roomId: string, teams: Team[]): void {
    const tMap = this.get<Record<string, Team[]>>('teams', {});
    tMap[roomId] = teams;
    this.set('teams', tMap);
  }

  getTeams(roomId: string): Team[] {
    const tMap = this.get<Record<string, Team[]>>('teams', {});
    return tMap[roomId] || [];
  }

  updateTeamScore(roomId: string, teamId: string, pointsToAdd: number): void {
    const tMap = this.get<Record<string, Team[]>>('teams', {});
    const teams = tMap[roomId] || [];
    const t = teams.find((item) => item.id === teamId);
    if (t) {
      t.total_score = (t.total_score || 0) + pointsToAdd;
      tMap[roomId] = teams;
      this.set('teams', tMap);
    }
  }

  addParticipant(participant: Participant): void {
    const pList = this.get<Participant[]>('participants_' + participant.room_id, []);
    const existingIndex = pList.findIndex((p) => p.id === participant.id);
    if (existingIndex >= 0) {
      pList[existingIndex] = participant;
    } else {
      pList.push(participant);
    }
    this.set('participants_' + participant.room_id, pList);
  }

  updateParticipantScore(roomId: string, participantId: string, pointsToAdd: number): void {
    const pList = this.get<Participant[]>('participants_' + roomId, []);
    const p = pList.find((item) => item.id === participantId);
    if (p) {
      p.score = (p.score || 0) + pointsToAdd;
      this.set('participants_' + roomId, pList);
    }
  }

  getParticipants(roomId: string): Participant[] {
    return this.get<Participant[]>('participants_' + roomId, []);
  }

  saveRoomQuestions(roomId: string, rqList: RoomQuestion[]): void {
    this.set('room_questions_' + roomId, rqList);
  }

  getRoomQuestions(roomId: string): RoomQuestion[] {
    return this.get<RoomQuestion[]>('room_questions_' + roomId, []);
  }

  addActivityLog(roomId: string, log: ActivityLog): void {
    const logs = this.get<ActivityLog[]>('activity_' + roomId, []);
    logs.unshift(log); // newest first
    this.set('activity_' + roomId, logs.slice(0, 30)); // max 30
  }

  getActivityLogs(roomId: string): ActivityLog[] {
    return this.get<ActivityLog[]>('activity_' + roomId, []);
  }

  // Cooldown store: participantId_questionId -> expiry timestamp
  setCooldown(key: string, expiryTimestamp: number): void {
    const cooldowns = this.get<Record<string, number>>('cooldowns', {});
    cooldowns[key] = expiryTimestamp;
    this.set('cooldowns', cooldowns);
  }

  getCooldown(key: string): number {
    const cooldowns = this.get<Record<string, number>>('cooldowns', {});
    return cooldowns[key] || 0;
  }
}

const localStore = new LocalStore();

// -------------------------------------------------------------
// PUBLIC METHODS
// -------------------------------------------------------------

export async function createRoom(data: {
  teacher_name: string;
  title: string;
  mode: GameMode;
  lock_duration: number;
  teams?: string[];
  preset_id?: string;
  custom_questions?: Array<Omit<Question, 'id' | 'room_id'>>;
}): Promise<{ room: Room; code: string }> {
  const code = generateRoomCode();
  const roomId = generateUUID();

  const newRoom: Room = {
    id: roomId,
    code,
    teacher_name: data.teacher_name,
    title: data.title,
    mode: data.mode,
    status: 'WAITING',
    lock_duration: data.lock_duration || 60,
    created_at: new Date().toISOString(),
  };

  const teamList: Team[] = [];
  if (data.mode === 'TEAM' && data.teams && data.teams.length > 0) {
    const colors = ['#06B6D4', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#EF4444'];
    data.teams.forEach((tName, idx) => {
      teamList.push({
        id: generateUUID(),
        room_id: roomId,
        team_name: tName,
        color: colors[idx % colors.length],
        total_score: 0,
      });
    });
  }

  const questions: Question[] = [];
  if (data.custom_questions && data.custom_questions.length > 0) {
    data.custom_questions.forEach((q, idx) => {
      questions.push({
        ...q,
        id: generateUUID(),
        room_id: roomId,
        order_index: idx + 1,
      });
    });
  } else {
    const selectedPreset = QUESTION_PRESETS.find((p) => p.id === data.preset_id) || QUESTION_PRESETS[0];
    selectedPreset.questions.forEach((q, idx) => {
      questions.push({
        ...q,
        id: generateUUID(),
        room_id: roomId,
        order_index: idx + 1,
      });
    });
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('rooms').insert([newRoom]);
      if (teamList.length > 0) await supabase.from('teams').insert(teamList);
      if (questions.length > 0) await supabase.from('questions').insert(questions);
    } catch {}
  }

  localStore.saveRoom(newRoom);
  localStore.saveTeams(roomId, teamList);
  localStore.saveQuestions(roomId, questions);

  return { room: newRoom, code };
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const normalized = code.trim().toUpperCase();
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('rooms').select('*').eq('code', normalized).single();
      if (data) return data as Room;
    } catch {}
  }
  return localStore.getRoom(normalized);
}

export async function getTeamsByRoomId(roomId: string): Promise<Team[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('teams').select('*').eq('room_id', roomId);
      if (data && data.length > 0) return data as Team[];
    } catch {}
  }
  return localStore.getTeams(roomId);
}

export async function getParticipantsByRoomId(roomId: string): Promise<Participant[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .order('score', { ascending: false });
      if (data) return data as Participant[];
    } catch {}
  }
  const pts = localStore.getParticipants(roomId);
  return pts.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export async function getQuestionsByRoomId(roomId: string): Promise<Question[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('questions')
        .select('*')
        .eq('room_id', roomId)
        .order('order_index', { ascending: true });
      if (data) return data as Question[];
    } catch {}
  }
  return localStore.getQuestions(roomId);
}

export async function joinRoom(params: {
  room_id: string;
  name: string;
  team_id?: string | null;
  team_name?: string | null;
}): Promise<Participant> {
  const participant: Participant = {
    id: generateUUID(),
    room_id: params.room_id,
    team_id: params.team_id || null,
    team_name: params.team_name || null,
    name: params.name,
    score: 0,
    is_active: true,
    joined_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('participants').insert([participant]);
    } catch {}
  }

  localStore.addParticipant(participant);

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('current_participant_' + params.room_id, JSON.stringify(participant));
    localStorage.setItem('current_participant_' + params.room_id, JSON.stringify(participant));
  }

  const room = localStore.getRoomById(params.room_id);
  if (room) {
    broadcastRoomEvent({
      event: 'PARTICIPANT_JOINED',
      room_code: room.code,
      room_id: room.id,
      timestamp: new Date().toISOString(),
      data: { participantName: participant.name, teamName: participant.team_name },
    });
  }

  return participant;
}

export async function getParticipantById(roomId: string, participantId: string): Promise<Participant | null> {
  const pts = await getParticipantsByRoomId(roomId);
  return pts.find(p => p.id === participantId) || null;
}

// -------------------------------------------------------------
// FASE 2: GAME ENGINE & REAL-TIME ATOMIC LOCKING
// -------------------------------------------------------------

export async function startGame(roomId: string): Promise<RoomQuestion[]> {
  const room = localStore.getRoomById(roomId);
  if (!room) throw new Error('Room tidak ditemukan');

  room.status = 'ACTIVE';
  localStore.saveRoom(room);

  // Inisialisasi Room Questions jika belum ada
  let rqList = localStore.getRoomQuestions(roomId);
  if (rqList.length === 0) {
    const questions = await getQuestionsByRoomId(roomId);
    rqList = questions.map((q) => ({
      id: generateUUID(),
      room_id: roomId,
      question_id: q.id,
      status: 'AVAILABLE',
      locked_by_participant_id: null,
      locked_by_team_id: null,
      locked_by_name: null,
      locked_at: null,
      lock_expires_at: null,
      solved_by_name: null,
      question: q,
    }));
    localStore.saveRoomQuestions(roomId, rqList);
  }

  // Tambah activity log
  localStore.addActivityLog(roomId, {
    id: generateUUID(),
    text: `Pertandingan resmi dimulai oleh ${room.teacher_name}!`,
    type: 'start',
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  // Broadcast game started
  broadcastRoomEvent({
    event: 'GAME_STARTED',
    room_code: room.code,
    room_id: room.id,
    timestamp: new Date().toISOString(),
  });

  return rqList;
}

export async function getRoomQuestions(roomId: string): Promise<RoomQuestion[]> {
  const rqList = localStore.getRoomQuestions(roomId);
  const now = Date.now();
  let hasExpired = false;

  // Cek jika ada lock yang sudah melewati batas waktu (expired)
  rqList.forEach((rq) => {
    if (rq.status === 'LOCKED' && rq.lock_expires_at) {
      const exp = new Date(rq.lock_expires_at).getTime();
      if (exp <= now) {
        // Otomatis bebaskan soal (Steal Window terbuka)
        const oldLocker = rq.locked_by_name;
        rq.status = 'AVAILABLE';
        rq.locked_by_participant_id = null;
        rq.locked_by_team_id = null;
        rq.locked_by_name = null;
        rq.locked_at = null;
        rq.lock_expires_at = null;
        hasExpired = true;

        const room = localStore.getRoomById(roomId);
        if (room) {
          localStore.addActivityLog(roomId, {
            id: generateUUID(),
            text: `Waktu habis! Soal lepas dari ${oldLocker || 'peserta'} dan kembali terbuka.`,
            type: 'release',
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          });

          broadcastRoomEvent({
            event: 'QUESTION_RELEASED',
            room_code: room.code,
            room_id: roomId,
            timestamp: new Date().toISOString(),
            data: { roomQuestionId: rq.id },
          });
        }
      }
    }
  });

  if (hasExpired) {
    localStore.saveRoomQuestions(roomId, rqList);
  }

  return rqList;
}

export async function attemptLockQuestion(
  roomQuestionId: string,
  participant: Participant,
  durationSeconds = 60
): Promise<LockResult> {
  const roomId = participant.room_id;
  const room = localStore.getRoomById(roomId);
  if (!room) return { status: 'ERROR', message: 'Room tidak valid.' };

  // Pastikan expired lock dibersihkan dulu
  const rqList = await getRoomQuestions(roomId);
  const targetRq = rqList.find((rq) => rq.id === roomQuestionId);

  if (!targetRq) {
    return { status: 'ERROR', message: 'Soal tidak ditemukan.' };
  }

  // 1. Cek apakah sudah diselesaikan
  if (targetRq.status === 'SOLVED') {
    return { status: 'ALREADY_LOCKED', message: 'Soal ini sudah berhasil dijawab peserta lain!' };
  }

  // 2. Cek apakah sedang di-lock oleh orang lain
  const now = Date.now();
  if (targetRq.status === 'LOCKED' && targetRq.lock_expires_at) {
    const exp = new Date(targetRq.lock_expires_at).getTime();
    if (exp > now) {
      if (
        targetRq.locked_by_participant_id === participant.id ||
        (room.mode === 'TEAM' && targetRq.locked_by_team_id && targetRq.locked_by_team_id === participant.team_id)
      ) {
        return {
          status: 'SUCCESS',
          message: 'Kamu sedang mengerjakan soal ini.',
          expires_at: targetRq.lock_expires_at,
        };
      }
      return {
        status: 'ALREADY_LOCKED',
        message: `Soal sedang dikunci oleh ${targetRq.locked_by_name || 'peserta lain'}!`,
      };
    }
  }

  // 3. Cek Aturan Single-Lock (1 Peserta / 1 Tim hanya boleh lock 1 soal dalam satu waktu)
  const activeLock = rqList.find((rq) => {
    if (rq.status !== 'LOCKED' || !rq.lock_expires_at) return false;
    if (new Date(rq.lock_expires_at).getTime() <= now) return false;

    if (rq.locked_by_participant_id === participant.id) return true;
    if (room.mode === 'TEAM' && participant.team_id && rq.locked_by_team_id === participant.team_id) return true;
    return false;
  });

  if (activeLock) {
    return {
      status: 'ALREADY_HAVE_LOCK',
      message: 'Kamu / Tim kamu sedang mengunci soal lain! Selesaikan atau tunggu sampai waktu habis.',
    };
  }

  // 4. Cek Cooldown Penalty (Anti-Trolling)
  const cdKey = `${participant.id}_${roomQuestionId}`;
  const cdExp = localStore.getCooldown(cdKey);
  if (cdExp > now) {
    const sisaDetik = Math.ceil((cdExp - now) / 1000);
    return {
      status: 'COOLDOWN',
      message: `Kamu dalam masa penalti untuk soal ini. Coba lagi dalam ${sisaDetik} detik!`,
    };
  }

  // ATOMIC LOCK DISETEL!
  const expiresAt = new Date(now + durationSeconds * 1000).toISOString();
  targetRq.status = 'LOCKED';
  targetRq.locked_by_participant_id = participant.id;
  targetRq.locked_by_team_id = participant.team_id || null;
  targetRq.locked_by_name = room.mode === 'TEAM' && participant.team_name ? participant.team_name : participant.name;
  targetRq.locked_at = new Date().toISOString();
  targetRq.lock_expires_at = expiresAt;

  localStore.saveRoomQuestions(roomId, rqList);

  // Catat log
  localStore.addActivityLog(roomId, {
    id: generateUUID(),
    text: `${targetRq.locked_by_name} baru saja MENGUNCI Soal #${targetRq.question?.order_index || ''}!`,
    type: 'lock',
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  // Broadcast ke seluruh murid & guru
  broadcastRoomEvent({
    event: 'QUESTION_LOCKED',
    room_code: room.code,
    room_id: roomId,
    timestamp: new Date().toISOString(),
    data: {
      roomQuestionId,
      lockedByName: targetRq.locked_by_name,
      expiresAt,
    },
  });

  return {
    status: 'SUCCESS',
    message: 'Berhasil mengunci soal! Kerjakan dalam waktu 60 detik.',
    expires_at: expiresAt,
  };
}

export async function submitAnswer(
  roomQuestionId: string,
  participant: Participant,
  selectedAnswer: 'A' | 'B' | 'C' | 'D'
): Promise<{ correct: boolean; pointsAwarded: number; correctAnswer: string }> {
  const roomId = participant.room_id;
  const room = localStore.getRoomById(roomId);
  const rqList = await getRoomQuestions(roomId);
  const targetRq = rqList.find((rq) => rq.id === roomQuestionId);

  if (!targetRq || !targetRq.question) {
    throw new Error('Soal tidak valid.');
  }

  const isCorrect = selectedAnswer === targetRq.question.correct_answer;
  const points = targetRq.question.points || 100;
  const displayName = room?.mode === 'TEAM' && participant.team_name ? participant.team_name : participant.name;

  if (isCorrect) {
    // JAWABAN BENAR!
    targetRq.status = 'SOLVED';
    targetRq.solved_by_name = displayName;
    targetRq.lock_expires_at = null;

    // Tambah skor ke siswa
    localStore.updateParticipantScore(roomId, participant.id, points);

    // Tambah skor ke kelompok jika mode TEAM
    if (room?.mode === 'TEAM' && participant.team_id) {
      localStore.updateTeamScore(roomId, participant.team_id, points);
    }

    localStore.saveRoomQuestions(roomId, rqList);

    // Activity Log
    localStore.addActivityLog(roomId, {
      id: generateUUID(),
      text: `${displayName} menjawab BENAR Soal #${targetRq.question.order_index} (+${points} PTS)!`,
      type: 'solve',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });

    // Broadcast
    if (room) {
      broadcastRoomEvent({
        event: 'QUESTION_SOLVED',
        room_code: room.code,
        room_id: roomId,
        timestamp: new Date().toISOString(),
        data: {
          roomQuestionId,
          solvedByName: displayName,
          pointsAwarded: points,
        },
      });
    }

    return { correct: true, pointsAwarded: points, correctAnswer: targetRq.question.correct_answer };
  } else {
    // JAWABAN SALAH! Lepas lock dan berikan cooldown 15 detik bagi siswa ini
    targetRq.status = 'AVAILABLE';
    targetRq.locked_by_participant_id = null;
    targetRq.locked_by_team_id = null;
    targetRq.locked_by_name = null;
    targetRq.locked_at = null;
    targetRq.lock_expires_at = null;

    // Cooldown 15 detik
    localStore.setCooldown(`${participant.id}_${roomQuestionId}`, Date.now() + 15000);
    localStore.saveRoomQuestions(roomId, rqList);

    localStore.addActivityLog(roomId, {
      id: generateUUID(),
      text: `${displayName} menjawab salah Soal #${targetRq.question.order_index}. Soal kembali bebas!`,
      type: 'release',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });

    if (room) {
      broadcastRoomEvent({
        event: 'QUESTION_RELEASED',
        room_code: room.code,
        room_id: roomId,
        timestamp: new Date().toISOString(),
        data: { roomQuestionId },
      });
    }

    return { correct: false, pointsAwarded: 0, correctAnswer: targetRq.question.correct_answer };
  }
}

export async function forceUnlockQuestion(roomQuestionId: string, roomId: string): Promise<void> {
  const room = localStore.getRoomById(roomId);
  const rqList = localStore.getRoomQuestions(roomId);
  const targetRq = rqList.find((rq) => rq.id === roomQuestionId);

  if (targetRq && targetRq.status === 'LOCKED') {
    const prevLocker = targetRq.locked_by_name;
    targetRq.status = 'AVAILABLE';
    targetRq.locked_by_participant_id = null;
    targetRq.locked_by_team_id = null;
    targetRq.locked_by_name = null;
    targetRq.locked_at = null;
    targetRq.lock_expires_at = null;

    localStore.saveRoomQuestions(roomId, rqList);

    localStore.addActivityLog(roomId, {
      id: generateUUID(),
      text: `Guru membuka paksa kunci Soal #${targetRq.question?.order_index || ''} (sebelumnya dipegang ${prevLocker}).`,
      type: 'info',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });

    if (room) {
      broadcastRoomEvent({
        event: 'FORCE_UNLOCKED',
        room_code: room.code,
        room_id: roomId,
        timestamp: new Date().toISOString(),
        data: { roomQuestionId },
      });
    }
  }
}

export async function getActivityLogsByRoomId(roomId: string): Promise<ActivityLog[]> {
  return localStore.getActivityLogs(roomId);
}

// -------------------------------------------------------------
// FASE 3: EXPORT REKAP NILAI CSV & IMPORT/EXPORT JSON SOAL
// -------------------------------------------------------------

export function exportScoresToCSV(
  room: Room,
  participants: Participant[],
  teams: Team[],
  roomQuestions: RoomQuestion[]
): void {
  if (typeof window === 'undefined') return;

  const lines: string[] = [];
  lines.push(`REKAPITULASI HASIL KOMPETISI CLASH OF CLASS`);
  lines.push(`Judul Sesi,${room.title}`);
  lines.push(`Kode Room,${room.code}`);
  lines.push(`Guru / Host,${room.teacher_name}`);
  lines.push(`Mode,${room.mode === 'TEAM' ? 'Kelompok (Team)' : 'Individu'}`);
  lines.push(`Waktu Selesai,${new Date().toLocaleString('id-ID')}`);
  lines.push(``);

  if (room.mode === 'TEAM') {
    lines.push(`KLASEMEN KELOMPOK`);
    lines.push(`Peringkat,Nama Kelompok,Total Skor`);
    const sortedTeams = [...teams].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
    sortedTeams.forEach((t, idx) => {
      lines.push(`${idx + 1},"${t.team_name}",${t.total_score || 0}`);
    });
    lines.push(``);
  }

  lines.push(`PERINGKAT SISWA`);
  lines.push(`Peringkat,Nama Siswa,Kelompok,Total Skor`);
  const sortedPts = [...participants].sort((a, b) => (b.score || 0) - (a.score || 0));
  sortedPts.forEach((p, idx) => {
    lines.push(`${idx + 1},"${p.name}","${p.team_name || '-'}",${p.score || 0}`);
  });
  lines.push(``);

  lines.push(`RINCIAN SOAL ARENA`);
  lines.push(`No,Pertanyaan,Bobot Poin,Status,Direbut Oleh`);
  roomQuestions.forEach((rq) => {
    const qText = rq.question?.question_text.replace(/"/g, '""') || '';
    lines.push(
      `${rq.question?.order_index || '-'},"${qText}",${rq.question?.points || 100},${rq.status},"${rq.solved_by_name || '-'}"`
    );
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(lines.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', `Rekap_Nilai_${room.code}_${room.title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportQuestionsToJSON(
  questions: Array<Omit<Question, 'id' | 'room_id'>>,
  title = 'Paket Soal Clash of Class'
): void {
  if (typeof window === 'undefined') return;

  const pkg = {
    title,
    version: '1.0',
    exported_at: new Date().toISOString(),
    total_questions: questions.length,
    questions,
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pkg, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `${title.replace(/[^a-zA-Z0-9]/g, '_')}_soal.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseQuestionsFromJSON(
  jsonString: string
): Array<Omit<Question, 'id' | 'room_id'>> {
  try {
    const parsed = JSON.parse(jsonString);
    const qList = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(qList)) throw new Error('Format JSON tidak memiliki array questions.');

    return qList.map((item, idx) => ({
      question_text: String(item.question_text || `Pertanyaan #${idx + 1}`),
      options: item.options && item.options.length === 4 ? item.options : [
        { label: 'A', text: item.options?.[0]?.text || 'Pilihan A' },
        { label: 'B', text: item.options?.[1]?.text || 'Pilihan B' },
        { label: 'C', text: item.options?.[2]?.text || 'Pilihan C' },
        { label: 'D', text: item.options?.[3]?.text || 'Pilihan D' },
      ],
      correct_answer: (['A', 'B', 'C', 'D'].includes(item.correct_answer) ? item.correct_answer : 'A') as 'A' | 'B' | 'C' | 'D',
      points: Number(item.points) || 100,
      order_index: idx + 1,
      explanation: item.explanation ? String(item.explanation) : undefined,
    }));
  } catch (err) {
    throw new Error('File JSON tidak valid atau format tidak sesuai: ' + (err as Error).message);
  }
}
