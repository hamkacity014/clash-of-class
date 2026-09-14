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
  private memoryFallback: Map<string, string> = new Map();

  private get<T>(key: string, defaultVal: T): T {
    let item: string | null = null;
    if (typeof window === 'undefined') {
      item = this.memoryFallback.get(STORAGE_PREFIX + key) || null;
    } else {
      item = localStorage.getItem(STORAGE_PREFIX + key);
    }
    if (!item) return defaultVal;
    try {
      return JSON.parse(item);
    } catch {
      return defaultVal;
    }
  }

  private set<T>(key: string, value: T): void {
    const valStr = JSON.stringify(value);
    if (typeof window === 'undefined') {
      this.memoryFallback.set(STORAGE_PREFIX + key, valStr);
    } else {
      localStorage.setItem(STORAGE_PREFIX + key, valStr);
    }
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

// Helper aman untuk insert questions ke Supabase dengan fallback jika kolom explanation belum dibuat
async function insertQuestionsToSupabase(qList: Question[]) {
  if (!isSupabaseConfigured || !supabase || qList.length === 0) return;
  try {
    const qRes = await supabase.from('questions').insert(qList);
    if (qRes.error) {
      if (qRes.error.message.includes('explanation')) {
        // Kolom explanation belum ada di schema Supabase, strip field explanation dan insert ulang
        const stripped = qList.map(({ explanation: _exp, ...rest }) => rest);
        const retryRes = await supabase.from('questions').insert(stripped);
        if (retryRes.error) console.warn('Supabase retry questions insert warning:', retryRes.error.message);
      } else if (qRes.error.code === '22001' || qRes.error.message.includes('varying(10)')) {
        // Jika kolom correct_answer masih VARCHAR(10) di Supabase, truncate untuk database insert agar tidak crash
        const truncated = qList.map((q) => ({
          ...q,
          correct_answer: q.correct_answer.slice(0, 10),
        }));
        const retryRes = await supabase.from('questions').insert(truncated);
        if (retryRes.error) console.warn('Supabase retry questions insert warning:', retryRes.error.message);
      } else {
        console.warn('Supabase insert questions warning:', qRes.error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase insertQuestionsToSupabase exception:', err);
  }
}

// Helper aman untuk insert participants ke Supabase dengan fallback jika kolom team_name belum dibuat
async function insertParticipantsToSupabase(pList: Participant | Participant[]) {
  if (!isSupabaseConfigured || !supabase) return;
  const list = Array.isArray(pList) ? pList : [pList];
  if (list.length === 0) return;
  try {
    const pRes = await supabase.from('participants').insert(list);
    if (pRes.error) {
      if (pRes.error.message.includes('team_name')) {
        // Kolom team_name belum ada di Supabase, strip field team_name dan insert ulang
        const stripped = list.map(({ team_name: _t, ...rest }) => rest);
        const retryRes = await supabase.from('participants').insert(stripped);
        if (retryRes.error) console.warn('Supabase retry participant insert warning:', retryRes.error.message);
      } else {
        console.warn('Supabase insert participant warning:', pRes.error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase insertParticipantsToSupabase exception:', err);
  }
}

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

  const initialRoomQuestions: RoomQuestion[] = questions.map((q) => ({
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

  if (isSupabaseConfigured && supabase) {
    try {
      const rRes = await supabase.from('rooms').insert([newRoom]);
      if (rRes.error) console.error('⚠️ Supabase insert rooms failed:', rRes.error.message);
      if (teamList.length > 0) {
        const tRes = await supabase.from('teams').insert(teamList);
        if (tRes.error) console.error('⚠️ Supabase insert teams failed:', tRes.error.message);
      }
      if (questions.length > 0) {
        await insertQuestionsToSupabase(questions);

        // Langsung daftarkan room_questions ke Supabase Cloud
        const toInsertRq = initialRoomQuestions.map((rq) => ({
          id: rq.id,
          room_id: rq.room_id,
          question_id: rq.question_id,
          status: 'AVAILABLE',
          locked_by_participant_id: null,
          locked_by_team_id: null,
          locked_by_name: null,
          locked_at: null,
          lock_expires_at: null,
          solved_by_name: null,
        }));
        const rqRes = await supabase.from('room_questions').insert(toInsertRq);
        if (rqRes.error) console.error('⚠️ Supabase insert room_questions in createRoom failed:', rqRes.error.message);
      }
    } catch (err) {
      console.error('⚠️ Supabase exception in createRoom:', err);
    }
  }

  localStore.saveRoom(newRoom);
  localStore.saveTeams(roomId, teamList);
  localStore.saveQuestions(roomId, questions);
  localStore.saveRoomQuestions(roomId, initialRoomQuestions);

  return { room: newRoom, code };
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const normalized = code.trim().toUpperCase();
  const localRoom = localStore.getRoom(normalized);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('rooms').select('*').eq('code', normalized).maybeSingle();
      if (data) {
        localStore.saveRoom(data as Room);
        return data as Room;
      }

      // Auto-recovery: Room ada di localStore tapi belum masuk Supabase
      if (localRoom) {
        await supabase.from('rooms').insert([localRoom]);
        const localTeams = localStore.getTeams(localRoom.id);
        if (localTeams.length > 0) {
          await supabase.from('teams').insert(localTeams);
        }
        const localQuestions = localStore.getQuestions(localRoom.id);
        if (localQuestions.length > 0) {
          await insertQuestionsToSupabase(localQuestions);
        }
        return localRoom;
      }
    } catch (err) {
      console.warn('Supabase getRoomByCode error:', err);
    }
  }
  return localRoom;
}

export async function getTeamsByRoomId(roomId: string): Promise<Team[]> {
  const localTeams = localStore.getTeams(roomId);
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('teams').select('*').eq('room_id', roomId);
      if (data && data.length > 0) return data as Team[];

      // Auto-sync jika di Supabase belum ada
      if (localTeams.length > 0) {
        const { data: rCheck } = await supabase.from('rooms').select('id').eq('id', roomId).maybeSingle();
        if (rCheck) {
          await supabase.from('teams').insert(localTeams);
        }
        return localTeams;
      }
    } catch {}
  }
  return localTeams;
}

export async function getParticipantsByRoomId(roomId: string): Promise<Participant[]> {
  const localPts = localStore.getParticipants(roomId);
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .order('score', { ascending: false });

      if (data && data.length > 0) {
        // Lengkapi team_name jika kolom team_name belum ada di database
        const teamList = await getTeamsByRoomId(roomId);
        const teamMap = new Map(teamList.map((t) => [t.id, t.team_name]));

        const mappedData: Participant[] = (data as Participant[]).map((p) => ({
          ...p,
          team_name: p.team_name || (p.team_id ? teamMap.get(p.team_id) || null : null),
        }));

        // Gabungkan jika ada peserta lokal yang belum sempat tersinkron
        const ids = new Set(mappedData.map((p) => p.id));
        const combined = [...mappedData];
        const missingLocals: Participant[] = [];
        for (const lp of localPts) {
          if (!ids.has(lp.id)) {
            combined.push(lp);
            missingLocals.push(lp);
          }
        }
        if (missingLocals.length > 0) {
          await insertParticipantsToSupabase(missingLocals);
        }
        return combined.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      // Jika di Supabase kosong tapi lokal ada data
      if (localPts.length > 0) {
        const { data: rCheck } = await supabase.from('rooms').select('id').eq('id', roomId).maybeSingle();
        if (rCheck) {
          await insertParticipantsToSupabase(localPts);
        }
        return localPts.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      if (data) return data as Participant[];
    } catch {}
  }
  return localPts.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export async function getQuestionsByRoomId(roomId: string): Promise<Question[]> {
  const localQuestions = localStore.getQuestions(roomId);
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('questions')
        .select('*')
        .eq('room_id', roomId)
        .order('order_index', { ascending: true });
      if (data && data.length > 0) return data as Question[];

      // Auto-sync soal jika di Supabase belum ada
      if (localQuestions.length > 0) {
        const { data: rCheck } = await supabase.from('rooms').select('id').eq('id', roomId).maybeSingle();
        if (rCheck) {
          await insertQuestionsToSupabase(localQuestions);
        }
        return localQuestions;
      }
    } catch {}
  }
  return localQuestions;
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
      // Pastikan room sudah ada di Supabase terlebih dahulu agar foreign key constraint tidak gagal
      const { data: rCheck } = await supabase.from('rooms').select('id').eq('id', params.room_id).maybeSingle();
      if (!rCheck) {
        const localRoom = localStore.getRoomById(params.room_id);
        if (localRoom) {
          await supabase.from('rooms').insert([localRoom]);
          const localTeams = localStore.getTeams(localRoom.id);
          if (localTeams.length > 0) await supabase.from('teams').insert(localTeams);
          const localQ = localStore.getQuestions(localRoom.id);
          if (localQ.length > 0) await insertQuestionsToSupabase(localQ);
        }
      }

      await insertParticipantsToSupabase(participant);
    } catch (err) {
      console.warn('Supabase joinRoom error:', err);
    }
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
  let room = localStore.getRoomById(roomId);
  if (!room && isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (data) {
        room = data as Room;
        localStore.saveRoom(room);
      }
    } catch {}
  }
  if (!room) throw new Error('Room tidak ditemukan');

  room.status = 'ACTIVE';
  localStore.saveRoom(room);

  // Update status room di Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('rooms').update({ status: 'ACTIVE' }).eq('id', roomId);
    } catch (err) {
      console.error('⚠️ Supabase update room status ACTIVE failed:', err);
    }
  }

  // Inisialisasi Room Questions jika belum ada
  let rqList = localStore.getRoomQuestions(roomId);
  const questions = await getQuestionsByRoomId(roomId);

  if (rqList.length === 0 && questions.length > 0) {
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

  // Sinkronkan room_questions ke Supabase Cloud
  if (isSupabaseConfigured && supabase && rqList.length > 0) {
    try {
      const { data: existingSbRq } = await supabase.from('room_questions').select('id').eq('room_id', roomId);
      if (!existingSbRq || existingSbRq.length === 0) {
        const toInsert = rqList.map((rq) => ({
          id: rq.id,
          room_id: rq.room_id,
          question_id: rq.question_id,
          status: 'AVAILABLE',
          locked_by_participant_id: null,
          locked_by_team_id: null,
          locked_by_name: null,
          locked_at: null,
          lock_expires_at: null,
          solved_by_name: null,
        }));
        await supabase.from('room_questions').insert(toInsert);
      }
    } catch (err) {
      console.error('⚠️ Supabase insert room_questions failed in startGame:', err);
    }
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

export async function finishGame(roomId: string): Promise<Room | null> {
  const room = localStore.getRoomById(roomId);
  if (!room) return null;

  room.status = 'FINISHED';
  localStore.saveRoom(room);

  // Bersihkan pertanyaan yang masih dalam status locked
  const rqList = localStore.getRoomQuestions(roomId);
  let hasLocked = false;
  rqList.forEach((rq) => {
    if (rq.status === 'LOCKED') {
      rq.status = 'AVAILABLE';
      rq.locked_by_participant_id = null;
      rq.locked_by_team_id = null;
      rq.locked_by_name = null;
      rq.locked_at = null;
      rq.lock_expires_at = null;
      hasLocked = true;
    }
  });
  if (hasLocked) {
    localStore.saveRoomQuestions(roomId, rqList);
  }

  // Update Supabase jika aktif
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('rooms').update({ status: 'FINISHED' }).eq('id', roomId);
    } catch {}
  }

  // Tambah activity log
  localStore.addActivityLog(roomId, {
    id: generateUUID(),
    text: `Pertandingan resmi diakhiri oleh ${room.teacher_name}!`,
    type: 'info',
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  // Broadcast event GAME_FINISHED ke semua tab siswa secara instan
  broadcastRoomEvent({
    event: 'GAME_FINISHED',
    room_code: room.code,
    room_id: room.id,
    timestamp: new Date().toISOString(),
  });

  return room;
}

export async function getRoomQuestions(roomId: string): Promise<RoomQuestion[]> {
  const now = Date.now();

  // 1. Prioritaskan pengambilan data live dari Supabase Cloud
  if (isSupabaseConfigured && supabase) {
    const client = supabase;
    try {
      const questions = await getQuestionsByRoomId(roomId);
      const qMap = new Map<string, Question>(questions.map((q) => [q.id, q]));

      const { data: sbRqData, error: sbRqErr } = await client
        .from('room_questions')
        .select('*')
        .eq('room_id', roomId);

      if (!sbRqErr && sbRqData && sbRqData.length > 0) {
        let syncedRqList: RoomQuestion[] = sbRqData
          .map((item: any) => ({
            id: item.id,
            room_id: item.room_id,
            question_id: item.question_id,
            status: (item.status || 'AVAILABLE') as 'AVAILABLE' | 'LOCKED' | 'SOLVED',
            locked_by_participant_id: item.locked_by_participant_id,
            locked_by_team_id: item.locked_by_team_id,
            locked_by_name: item.locked_by_name,
            locked_at: item.locked_at,
            lock_expires_at: item.lock_expires_at,
            solved_by_name: item.solved_by_name,
            question: qMap.get(item.question_id),
          }))
          .filter((item) => Boolean(item.question));

        // Cek lock expired secara realtime
        let hasExpired = false;
        syncedRqList.forEach((rq) => {
          if (rq.status === 'LOCKED' && rq.lock_expires_at) {
            const exp = new Date(rq.lock_expires_at).getTime();
            if (exp <= now) {
              rq.status = 'AVAILABLE';
              rq.locked_by_participant_id = null;
              rq.locked_by_team_id = null;
              rq.locked_by_name = null;
              rq.locked_at = null;
              rq.lock_expires_at = null;
              hasExpired = true;

              // Update Supabase in background
              client
                .from('room_questions')
                .update({
                  status: 'AVAILABLE',
                  locked_by_participant_id: null,
                  locked_by_team_id: null,
                  locked_by_name: null,
                  locked_at: null,
                  lock_expires_at: null,
                })
                .eq('id', rq.id)
                .then();
            }
          }
        });

        syncedRqList.sort((a, b) => (a.question?.order_index || 0) - (b.question?.order_index || 0));
        localStore.saveRoomQuestions(roomId, syncedRqList);
        return syncedRqList;
      }

      // Auto-heal: Jika tabel room_questions di Supabase belum terisi tapi master questions ada
      if (questions.length > 0) {
        const generatedRqList: RoomQuestion[] = questions.map((q) => ({
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

        const toInsert = generatedRqList.map((rq) => ({
          id: rq.id,
          room_id: rq.room_id,
          question_id: rq.question_id,
          status: 'AVAILABLE',
          locked_by_participant_id: null,
          locked_by_team_id: null,
          locked_by_name: null,
          locked_at: null,
          lock_expires_at: null,
          solved_by_name: null,
        }));

        await supabase.from('room_questions').insert(toInsert);
        localStore.saveRoomQuestions(roomId, generatedRqList);
        return generatedRqList;
      }
    } catch (err) {
      console.error('⚠️ Error fetching room_questions from Supabase Cloud:', err);
    }
  }

  // 2. Fallback Local Memory Store
  let rqList = localStore.getRoomQuestions(roomId);
  if (rqList.length === 0) {
    const questions = localStore.getQuestions(roomId);
    if (questions.length > 0) {
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
  }
  let hasExpired = false;

  // Cek jika ada lock yang sudah melewati batas waktu (expired)
  rqList.forEach((rq) => {
    if (rq.status === 'LOCKED' && rq.lock_expires_at) {
      const exp = new Date(rq.lock_expires_at).getTime();
      if (exp <= now) {
        // Otomatis bebaskan soal (Steal Window terbuka)
        const oldLocker = rq.locked_by_name;
        const oldPid = rq.locked_by_participant_id;
        if (oldPid) {
          localStore.setCooldown(`${oldPid}_${rq.id}`, Date.now() + 20000);
        }
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

// Mutex queue per room to serialize lock attempts and eliminate race conditions (Fase 4 SRS)
const roomLockMutexes = new Map<string, Promise<unknown>>();

async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = roomLockMutexes.get(roomId) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  roomLockMutexes.set(roomId, next);

  try {
    await prev;
    return await fn();
  } finally {
    release!();
    if (roomLockMutexes.get(roomId) === next) {
      roomLockMutexes.delete(roomId);
    }
  }
}

export async function attemptLockQuestion(
  roomQuestionId: string,
  participant: Participant,
  durationSeconds = 60
): Promise<LockResult> {
  return withRoomLock(participant.room_id, async () => {
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

  // Sinkronkan update status locked ke Supabase Cloud
  if (isSupabaseConfigured && supabase) {
    try {
      supabase
        .from('room_questions')
        .update({
          status: 'LOCKED',
          locked_by_participant_id: participant.id,
          locked_by_team_id: participant.team_id || null,
          locked_by_name: targetRq.locked_by_name,
          locked_at: targetRq.locked_at,
          lock_expires_at: expiresAt,
        })
        .eq('id', roomQuestionId)
        .then();
    } catch {}
  }

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
  });
}

export async function submitAnswer(
  roomQuestionId: string,
  participant: Participant,
  selectedAnswer: string
): Promise<{ correct: boolean; pointsAwarded: number; correctAnswer?: string }> {
  const roomId = participant.room_id;
  const room = localStore.getRoomById(roomId);
  const rqList = await getRoomQuestions(roomId);
  const targetRq = rqList.find((rq) => rq.id === roomQuestionId);

  if (!targetRq || !targetRq.question) {
    throw new Error('Soal tidak valid.');
  }

  // Cek apakah tipe soal Essay atau Pilihan Ganda
  const isEssay = targetRq.question.type === 'ESSAY' || !targetRq.question.options || targetRq.question.options.length === 0;

  let isCorrect = false;
  if (isEssay) {
    // Evaluasi Essay: case-insensitive, trimmed, dan mendukung multi-sinonim dipisah ';'
    const studentAns = selectedAnswer.trim().toLowerCase();
    const acceptedAnswers = targetRq.question.correct_answer
      .split(';')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    isCorrect = acceptedAnswers.some((ans) => ans === studentAns);
  } else {
    isCorrect = selectedAnswer.trim().toUpperCase() === targetRq.question.correct_answer.trim().toUpperCase();
  }
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

    // Update live status dan skor ke Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      try {
        supabase
          .from('room_questions')
          .update({
            status: 'SOLVED',
            solved_by_name: displayName,
            lock_expires_at: null,
          })
          .eq('id', roomQuestionId)
          .then();

        const newScore = (participant.score || 0) + points;
        supabase
          .from('participants')
          .update({ score: newScore })
          .eq('id', participant.id)
          .then();

        if (room?.mode === 'TEAM' && participant.team_id) {
          const tms = localStore.getTeams(roomId);
          const myTeam = tms.find((t) => t.id === participant.team_id);
          if (myTeam) {
            supabase
              .from('teams')
              .update({ total_score: myTeam.total_score })
              .eq('id', participant.team_id)
              .then();
          }
        }
      } catch {}
    }

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
    // JAWABAN SALAH! Lepas lock dan berikan cooldown 20 detik bagi siswa ini (PRD Fase 4)
    targetRq.status = 'AVAILABLE';
    targetRq.locked_by_participant_id = null;
    targetRq.locked_by_team_id = null;
    targetRq.locked_by_name = null;
    targetRq.locked_at = null;
    targetRq.lock_expires_at = null;

    // Cooldown 20 detik anti-trolling
    localStore.setCooldown(`${participant.id}_${roomQuestionId}`, Date.now() + 20000);
    localStore.saveRoomQuestions(roomId, rqList);

    // Update lepas lock ke Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      try {
        supabase
          .from('room_questions')
          .update({
            status: 'AVAILABLE',
            locked_by_participant_id: null,
            locked_by_team_id: null,
            locked_by_name: null,
            locked_at: null,
            lock_expires_at: null,
          })
          .eq('id', roomQuestionId)
          .then();
      } catch {}
    }

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
        data: { 
          roomQuestionId,
          reason: 'WRONG_ANSWER',
          message: `${displayName} menjawab salah. Soal kembali terbuka!`
        },
      });
    }

    return { correct: false, pointsAwarded: 0 };
  }
}

export function getRemainingCooldown(participantId: string, roomQuestionId: string): number {
  const cdKey = `${participantId}_${roomQuestionId}`;
  const cdExp = localStore.getCooldown(cdKey);
  const diff = cdExp - Date.now();
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

export async function handleQuestionTimeout(roomQuestionId: string, participant: Participant): Promise<void> {
  const roomId = participant.room_id;
  const room = localStore.getRoomById(roomId);
  const rqList = localStore.getRoomQuestions(roomId);
  const targetRq = rqList.find((rq) => rq.id === roomQuestionId);

  if (!targetRq) return;

  const isOwner =
    targetRq.locked_by_participant_id === participant.id ||
    (room?.mode === 'TEAM' && targetRq.locked_by_team_id && targetRq.locked_by_team_id === participant.team_id);

  if (targetRq.status === 'LOCKED' && isOwner) {
    const displayName = room?.mode === 'TEAM' && participant.team_name ? participant.team_name : participant.name;
    const orderIndex = targetRq.question?.order_index || '';

    targetRq.status = 'AVAILABLE';
    targetRq.locked_by_participant_id = null;
    targetRq.locked_by_team_id = null;
    targetRq.locked_by_name = null;
    targetRq.locked_at = null;
    targetRq.lock_expires_at = null;

    // Cooldown 20 detik anti-trolling
    localStore.setCooldown(`${participant.id}_${roomQuestionId}`, Date.now() + 20000);
    localStore.saveRoomQuestions(roomId, rqList);

    // Update status ke Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      try {
        supabase
          .from('room_questions')
          .update({
            status: 'AVAILABLE',
            locked_by_participant_id: null,
            locked_by_team_id: null,
            locked_by_name: null,
            locked_at: null,
            lock_expires_at: null,
          })
          .eq('id', roomQuestionId)
          .then();
      } catch {}
    }

    localStore.addActivityLog(roomId, {
      id: generateUUID(),
      text: `Waktu habis! Soal #${orderIndex} lepas dari ${displayName} dan kembali terbuka.`,
      type: 'release',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });

    if (room) {
      broadcastRoomEvent({
        event: 'QUESTION_RELEASED',
        room_code: room.code,
        room_id: roomId,
        timestamp: new Date().toISOString(),
        data: { 
          roomQuestionId,
          reason: 'TIMEOUT',
          message: 'Waktu pengerjaan habis! Soal kembali terbuka.'
        },
      });
    }
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

    // Update status ke Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      try {
        supabase
          .from('room_questions')
          .update({
            status: 'AVAILABLE',
            locked_by_participant_id: null,
            locked_by_team_id: null,
            locked_by_name: null,
            locked_at: null,
            lock_expires_at: null,
          })
          .eq('id', roomQuestionId)
          .then();
      } catch {}
    }

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

    return qList.map((item, idx) => {
      const isEssay = item.type === 'ESSAY' || (!item.options || item.options.length === 0);
      return {
        type: (isEssay ? 'ESSAY' : 'MULTIPLE_CHOICE') as 'ESSAY' | 'MULTIPLE_CHOICE',
        question_text: String(item.question_text || `Pertanyaan #${idx + 1}`),
        options: isEssay
          ? []
          : (item.options && item.options.length === 4 ? item.options : [
              { label: 'A', text: item.options?.[0]?.text || 'Pilihan A' },
              { label: 'B', text: item.options?.[1]?.text || 'Pilihan B' },
              { label: 'C', text: item.options?.[2]?.text || 'Pilihan C' },
              { label: 'D', text: item.options?.[3]?.text || 'Pilihan D' },
            ]),
        correct_answer: isEssay 
          ? String(item.correct_answer || '').trim() 
          : (['A', 'B', 'C', 'D'].includes(item.correct_answer) ? item.correct_answer : 'A'),
        points: Number(item.points) || 100,
        order_index: idx + 1,
        explanation: item.explanation ? String(item.explanation) : undefined,
      };
    });
  } catch (err) {
    throw new Error('File JSON tidak valid atau format tidak sesuai: ' + (err as Error).message);
  }
}
