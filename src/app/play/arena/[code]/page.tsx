'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import confetti from 'canvas-confetti';
import { 
  getRoomByCode, 
  getRoomQuestions, 
  attemptLockQuestion, 
  submitAnswer, 
  subscribeToRoomEvents,
  getParticipantsByRoomId,
  getTeamsByRoomId,
  getRemainingCooldown,
  handleQuestionTimeout
} from '@/lib/store';
import { Room, Participant, Team, RoomQuestion, RealtimeEventPayload } from '@/types';
import { soundFx } from '@/lib/sound';
import { 
  Lock, 
  Clock, 
  CheckCircle2, 
  Zap, 
  AlertCircle, 
  Trophy, 
  X, 
  Sparkles,
  ArrowRight,
  Shield,
  HelpCircle,
  Radio,
  Crown,
  Home
} from 'lucide-react';

function StudentArenaContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = (params?.code as string)?.toUpperCase();
  const pid = searchParams?.get('pid');

  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [roomQuestions, setRoomQuestions] = useState<RoomQuestion[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<RoomQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(60);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasCelebratedRef = useRef(false);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Muat data room, peserta, dan pertanyaan
  const loadArenaData = useCallback(async () => {
    if (!code) return;
    const r = await getRoomByCode(code);
    if (!r) return;
    setRoom(r);

    const [pts, rqList, tms] = await Promise.all([
      getParticipantsByRoomId(r.id),
      getRoomQuestions(r.id),
      getTeamsByRoomId(r.id),
    ]);
    setRoomQuestions(rqList);
    setAllParticipants(pts);
    setTeams(tms);

    if (r.status === 'FINISHED') {
      setActiveQuestion(null);
      setShowResultModal(true);
    }

    // Ambil peserta saat ini: Prioritas 1: pid dari URL
    let currentP: Participant | null = null;
    if (pid) {
      currentP = pts.find(p => p.id === pid) || null;
    }

    // Prioritas 2: sessionStorage (terisolasi per-tab di browser)
    if (!currentP && typeof window !== 'undefined') {
      const sess = sessionStorage.getItem('current_participant_' + r.id);
      if (sess) {
        try { currentP = JSON.parse(sess); } catch {}
      }
    }

    // Prioritas 3: localStorage fallback
    if (!currentP && typeof window !== 'undefined') {
      const loc = localStorage.getItem('current_participant_' + r.id);
      if (loc) {
        try { currentP = JSON.parse(loc); } catch {}
      }
    }

    if (currentP) {
      setParticipant((prev) => (prev?.id === currentP?.id && prev?.score === currentP?.score ? prev : currentP));
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('current_participant_' + r.id, JSON.stringify(currentP));
      }
    }

    // HANYA peserta yang secara spesifik mengunci soal ini yang membuka modal pengerjaan:
    if (currentP) {
      const myLocked = rqList.find((rq) => {
        if (rq.status !== 'LOCKED' || !rq.lock_expires_at) return false;
        if (new Date(rq.lock_expires_at).getTime() <= Date.now()) return false;
        // PENTING: Hanya peserta yang mengunci yang memiliki modal terbuka
        return rq.locked_by_participant_id === currentP?.id;
      });

      if (myLocked) {
        setActiveQuestion((prev) => {
          if (prev && prev.id === myLocked.id && prev.lock_expires_at === myLocked.lock_expires_at) {
            return prev;
          }
          return myLocked;
        });
      } else {
        // Jika bukan dia yang mengunci (misal dikunci tim lain), pastikan modal TERTUTUP!
        setActiveQuestion(null);
      }
    } else {
      setActiveQuestion(null);
    }
  }, [code, pid]);

  // Sync Timer Pengerjaan
  useEffect(() => {
    if (!activeQuestion || !activeQuestion.lock_expires_at) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const exp = new Date(activeQuestion.lock_expires_at!).getTime();
      const diff = Math.max(0, Math.ceil((exp - now) / 1000));
      setRemainingSeconds(diff);

      // Audio tick di 10 detik terakhir
      if (diff <= 10 && diff > 0) {
        soundFx.playTick();
      }

      // Waktu habis! (Fase 4 Anti-Troll Timeout Handler)
      if (diff <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        soundFx.playLock();
        if (participant && activeQuestion) {
          handleQuestionTimeout(activeQuestion.id, participant);
        }
        setActiveQuestion(null);
        setSelectedOption(null);
        showToast('Waktu habis! Soal lepas dan kamu terkena penalti 20 detik.');
        loadArenaData();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeQuestion, loadArenaData]);

  // Real-time Event Subscription
  useEffect(() => {
    loadArenaData();

    const unsubscribe = subscribeToRoomEvents(code, (payload: RealtimeEventPayload) => {
      // Refresh board kapan saja ada aksi lock, release, atau solve
      loadArenaData();

      if (payload.event === 'GAME_FINISHED') {
        setActiveQuestion(null);
        setSelectedOption(null);
        if (timerRef.current) clearInterval(timerRef.current);
        soundFx.playSuccess();
        confetti({
          particleCount: 120,
          spread: 90,
          origin: { y: 0.5 },
          colors: ['#F59E0B', '#06B6D4', '#10B981', '#ffffff'],
        });
        setShowResultModal(true);
        loadArenaData();
      } else if (payload.event === 'QUESTION_LOCKED') {
        const locker = (payload.data?.lockedByName as string) || 'Seseorang';
        showToast(`⚡ ${locker} baru saja mengunci salah satu soal!`);
      } else if (payload.event === 'QUESTION_RELEASED') {
        showToast('🔓 Waktu soal habis! Soal kembali terbuka untuk diperebutkan.');
      } else if (payload.event === 'QUESTION_SOLVED') {
        const solver = (payload.data?.solvedByName as string) || 'Peserta';
        const pts = (payload.data?.pointsAwarded as number) || 100;
        showToast(`🎉 ${solver} berhasil menjawab BENAR (+${pts} PTS)!`);
      } else if (payload.event === 'FORCE_UNLOCKED') {
        showToast('ℹ️ Guru membuka paksa salah satu soal.');
      }
    });

    const pollInterval = setInterval(loadArenaData, 2500);

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [code, loadArenaData]);

  // Efek selebrasi suara & confetti satu kali saat game selesai
  useEffect(() => {
    if (room?.status === 'FINISHED' && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      soundFx.playSuccess();
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        colors: ['#F59E0B', '#06B6D4', '#10B981', '#ffffff'],
      });
    }
  }, [room?.status]);

  // Handler: Buka & Kunci Soal
  const handleLockQuestion = async (rq: RoomQuestion) => {
    if (!participant || !room) return;
    if (room.status === 'FINISHED') {
      showToast('⚠️ Pertandingan telah selesai.');
      return;
    }
    soundFx.playClick();

    const result = await attemptLockQuestion(rq.id, participant, room.lock_duration || 60);

    if (result.status === 'SUCCESS') {
      soundFx.playLock();
      setActiveQuestion(rq);
      setSelectedOption(null);
      setFeedback(null);
      setRemainingSeconds(room.lock_duration || 60);
      loadArenaData();
    } else {
      soundFx.playLock();
      showToast(`⚠️ ${result.message}`);
      loadArenaData();
    }
  };

  // Handler: Kirim Jawaban
  const handleSubmitAnswer = async () => {
    if (!activeQuestion || !participant || !selectedOption || !selectedOption.trim()) {
      const isEssay = activeQuestion?.question?.type === 'ESSAY' || !activeQuestion?.question?.options || activeQuestion.question.options.length === 0;
      alert(isEssay ? 'Tuliskan jawaban essay terlebih dahulu!' : 'Pilih salah satu jawaban terlebih dahulu!');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitAnswer(activeQuestion.id, participant, selectedOption);

      if (res.correct) {
        soundFx.playSuccess();
        // Efek Confetti Ledakan Kemenangan
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#F59E0B', '#06B6D4', '#10B981', '#ffffff'],
        });

        setFeedback({
          type: 'success',
          message: `LUAR BIASA! Jawaban Benar (+${res.pointsAwarded} PTS)!`,
        });

        // Update skor lokal instan
        if (participant) {
          setParticipant({ ...participant, score: (participant.score || 0) + res.pointsAwarded });
        }

        // Sinkronisasi data latar belakang (modal tetap dibuka agar siswa leluasa membaca pembahasan)
        loadArenaData();
      } else {
        soundFx.playLock();
        // Jawaban salah: langsung tutup modal pengerjaan dan kembali ke bank soal arena tanpa membocorkan kunci jawaban
        setActiveQuestion(null);
        setSelectedOption(null);
        setFeedback(null);
        showToast('❌ Jawaban Kurang Tepat! Soal lepas dan dapat direbut lawan.');
        loadArenaData();
      }
    } catch {
      alert('Gagal mengirim jawaban. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar hideHostBtn={true} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Radio className="w-8 h-8 text-cyan-400 animate-pulse mx-auto" />
            <p className="text-slate-400 text-sm">Menghubungkan ke Arena {code}...</p>
          </div>
        </div>
      </div>
    );
  }

  // Hitung jumlah soal tersedia
  const availableCount = roomQuestions.filter((q) => q.status === 'AVAILABLE').length;
  const solvedCount = roomQuestions.filter((q) => q.status === 'SOLVED').length;

  // Cek apakah ada anggota kelompok yang sedang mengerjakan soal
  const teamLockedQuestion = room?.mode === 'TEAM' && participant?.team_id
    ? roomQuestions.find(
        (rq) =>
          rq.status === 'LOCKED' &&
          rq.locked_by_team_id === participant.team_id &&
          rq.locked_by_participant_id !== participant.id
      )
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      <Navbar hideHostBtn={true} />

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-slate-900/95 border border-cyan-500/50 shadow-2xl shadow-cyan-500/20 px-4 py-3 rounded-xl text-xs font-semibold text-white flex items-center gap-2 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 sm:py-8 w-full">
        {/* Banner Permainan Selesai (Jika Guru mengakhiri sesi) */}
        {room.status === 'FINISHED' && (
          <div className="bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 backdrop-blur-md mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-amber-500/10 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Pertandingan Telah Selesai</h3>
                <p className="text-xs text-amber-200/80">Guru telah mengakhiri sesi arena. Terima kasih atas usaha dan partisipasi terbaikmu!</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowResultModal(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2 shrink-0"
            >
              <Trophy className="w-4 h-4" />
              <span>Lihat Hasil & Peringkat</span>
            </button>
          </div>
        )}

        {/* Top Battle HUD (Heads-Up Display) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          {/* Info Siswa */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-cyan-500/20">
              {participant?.name ? participant.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm sm:text-base">
                  {participant?.name || 'Kontestan'}
                </span>
                {participant?.team_name ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                    {participant.team_name}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-medium">
                    Individu
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Arena: {room.title}</span>
              </div>
            </div>
          </div>

          {/* Skor & Status Soal */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                Skor Kamu:
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-black text-amber-400 flex items-center gap-1 justify-end">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>{participant?.score || 0}</span>
                <span className="text-xs text-amber-500">PTS</span>
              </div>
            </div>

            <div className="h-10 w-[1px] bg-slate-800"></div>

            <div className="text-left">
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                Sisa Soal:
              </div>
              <div className="text-lg font-mono font-bold text-cyan-300">
                {availableCount} <span className="text-xs text-slate-500">/ {roomQuestions.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Banner Kolaborasi Team Sync */}
        {teamLockedQuestion && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-cyan-500/20 to-amber-500/20 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between shadow-lg shadow-amber-500/10 animate-pulse">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
              <span>
                <strong>TEAM SYNC:</strong> Rekan kelompokmu <strong>({teamLockedQuestion.locked_by_name})</strong> sedang mengunci dan mengerjakan <strong>Soal #{teamLockedQuestion.question?.order_index}</strong>! Bersiaplah untuk soal berikutnya.
              </span>
            </div>
            <span className="font-mono font-bold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 shrink-0 ml-2">
              +{teamLockedQuestion.question?.points} PTS
            </span>
          </div>
        )}

        {/* Header Board */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>THE BATTLE BOARD</span>
            </h2>
            <p className="text-xs text-slate-400">
              Klik kartu soal yang masih tersedia untuk menguncinya selama 60 detik.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Tersedia ({availableCount})
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Terkunci ({roomQuestions.filter(q => q.status === 'LOCKED').length})
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Selesai ({solvedCount})
            </span>
          </div>
        </div>

        {/* Grid Kartu Soal Arena */}
        {roomQuestions.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900/50 border border-slate-800 p-8 my-8 animate-pulse">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto mb-3"></div>
            <h3 className="text-base font-bold text-slate-200 mb-1">Menyiapkan Papan Soal Pertandingan...</h3>
            <p className="text-xs text-slate-400">Menghubungkan ke server arena kuis cloud. Tunggu sebentar...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
            {roomQuestions.map((rq) => {
              const isAvailable = rq.status === 'AVAILABLE';
              const isLocked = rq.status === 'LOCKED';
              const isSolved = rq.status === 'SOLVED';

            // Hitung sisa detik jika locked
            let cardSecondsLeft = 0;
            if (isLocked && rq.lock_expires_at) {
              cardSecondsLeft = Math.max(0, Math.ceil((new Date(rq.lock_expires_at).getTime() - Date.now()) / 1000));
            }

            // Hitung cooldown penalti peserta (Anti-Troll Fase 4)
            const myCooldown = (isAvailable && participant) ? getRemainingCooldown(participant.id, rq.id) : 0;
            const isInCooldown = myCooldown > 0;

            return (
              <div
                key={rq.id}
                className={`relative rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between min-h-[160px] ${
                  isAvailable
                    ? room.status === 'FINISHED'
                      ? 'bg-slate-900/40 border-slate-800 opacity-60'
                      : isInCooldown
                      ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400 cursor-not-allowed shadow-sm'
                      : 'bg-slate-900/70 border-slate-700/80 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer group'
                    : isLocked
                    ? 'bg-amber-950/20 border-amber-500/50 animate-cyber-pulse'
                    : 'bg-emerald-950/20 border-emerald-500/40 opacity-90'
                }`}
                onClick={() => {
                  if (isAvailable && room.status !== 'FINISHED') {
                    if (isInCooldown) {
                      soundFx.playLock();
                      showToast(`⚠️ Kamu dalam masa penalti untuk soal ini. Tunggu ${myCooldown} detik lagi!`);
                    } else {
                      handleLockQuestion(rq);
                    }
                  }
                }}
              >
                {/* Header Kartu */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-sm text-slate-300">
                      SOAL #{rq.question?.order_index}
                    </span>
                    {rq.question && (rq.question.type === 'ESSAY' || !rq.question.options || rq.question.options.length === 0) && (
                      <span className="text-[10px] font-bold text-purple-300 bg-purple-950/60 border border-purple-500/40 px-1.5 py-0.5 rounded leading-none">
                        Essay
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      isAvailable
                        ? isInCooldown
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : isLocked
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    +{rq.question?.points || 100} PTS
                  </span>
                </div>

                {/* Status Body */}
                <div className="my-auto py-2">
                  {isAvailable && (
                    isInCooldown ? (
                      <div className="text-center space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold">
                          <Clock className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                          <span>Penalti: {myCooldown}s</span>
                        </div>
                        <p className="text-[10px] text-rose-400/80">Tunggu cooldown penalti selesai</p>
                      </div>
                    ) : (
                      <div className="text-center space-y-1">
                        <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center justify-center gap-1.5">
                          <Zap className="w-4 h-4 text-cyan-400 group-hover:scale-125 transition-transform" />
                          KLIK UNTUK KUNCI
                        </span>
                        <p className="text-[10px] text-slate-500">Batas pengerjaan 60 detik</p>
                      </div>
                    )
                  )}

                  {isLocked && (
                    <div className="text-center space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{rq.locked_by_name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-amber-400 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                        <span>Sisa: {cardSecondsLeft}s</span>
                      </div>
                    </div>
                  )}

                  {isSolved && (
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>DIREBUT</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-300 truncate">
                        Oleh {rq.solved_by_name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Kartu */}
                <div className="pt-2 border-t border-slate-800/80 text-[10px] flex items-center justify-between text-slate-500">
                  <span>Level: {rq.question?.points === 300 ? 'Sulit' : rq.question?.points === 200 ? 'Sedang' : 'Mudah'}</span>
                  {isAvailable && (
                    <span className="text-cyan-400 font-bold group-hover:translate-x-1 transition-transform inline-block">
                      Ambil &rarr;
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL PENGERJAAN SOAL (SOLVER WORKSPACE) - HANYA UNTUK SISWA PENGUNCI     */}
      {/* ========================================================================= */}
      {activeQuestion && activeQuestion.question && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-500/20 relative overflow-hidden flex flex-col">
            {/* Top Glowing Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500"></div>

            {/* Modal Header: Nomor Soal, Badge Tipe, Timer Melingkar, & Nilai Poin */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Kamu Sedang Mengunci:
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      activeQuestion.question.type === 'ESSAY' || !activeQuestion.question.options || activeQuestion.question.options.length === 0
                        ? 'bg-purple-950/70 border-purple-500/50 text-purple-300 shadow-sm shadow-purple-500/20'
                        : 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                    }`}
                  >
                    {activeQuestion.question.type === 'ESSAY' || !activeQuestion.question.options || activeQuestion.question.options.length === 0
                      ? '✍️ Essay / Isian Singkat'
                      : '🔘 Pilihan Ganda'}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  Soal #{activeQuestion.question.order_index}
                </h3>
              </div>

              {/* Radial / Box Timer 60 Detik */}
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border font-mono font-black text-lg transition-all ${
                  remainingSeconds <= 10
                    ? 'border-rose-500 bg-rose-950/40 text-rose-400 animate-pulse'
                    : remainingSeconds <= 25
                    ? 'border-amber-500 bg-amber-950/40 text-amber-400'
                    : 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                }`}
              >
                <Clock className="w-5 h-5" />
                <span>{remainingSeconds}s</span>
              </div>
            </div>

            {/* Pertanyaan */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 mb-6">
              <p className="text-base sm:text-lg font-semibold text-slate-100 leading-relaxed">
                {activeQuestion.question.question_text}
              </p>
            </div>

            {/* Area Jawaban: Essay Teks vs Pilihan Ganda (A, B, C, D) */}
            {activeQuestion.question.type === 'ESSAY' || !activeQuestion.question.options || activeQuestion.question.options.length === 0 ? (
              <div className="mb-6 space-y-2">
                <label className="block text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>✍️ Tuliskan Jawaban Essay / Isian Singkat Kamu:</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={selectedOption || ''}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && selectedOption && selectedOption.trim() && !isSubmitting) {
                        e.preventDefault();
                        handleSubmitAnswer();
                      }
                    }}
                    placeholder="Ketik jawabanmu di sini... (tekan Enter untuk kirim)"
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border-2 border-purple-500/50 focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-500/20 text-white font-medium text-base sm:text-lg placeholder:text-slate-600 transition-all shadow-inner"
                  />
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <span>💡</span>
                  <span>Huruf besar/kecil tidak berpengaruh. Tekan <strong>Enter</strong> atau tombol di bawah untuk mengirim.</span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {activeQuestion.question.options.map((opt) => {
                  const isSelected = selectedOption === opt.label;
                  return (
                    <button
                      type="button"
                      key={opt.label}
                      onClick={() => {
                        setSelectedOption(opt.label);
                        soundFx.playClick();
                      }}
                      className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/50 text-white shadow-md shadow-cyan-500/20'
                          : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                          isSelected
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="text-sm font-medium pt-0.5 leading-snug">
                        {opt.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Feedback Alert (Hanya saat jawaban Benar) */}
            {feedback && feedback.type === 'success' && (
              <div className="space-y-3 mb-4 animate-in zoom-in-95">
                <div className="p-4 rounded-2xl border text-sm font-bold flex items-center gap-2 border-emerald-500 bg-emerald-950/60 text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{feedback.message}</span>
                </div>

                {/* Pembahasan Edukatif Soal */}
                {activeQuestion.question.explanation && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                    <span className="text-base">💡</span>
                    <div>
                      <span className="font-bold text-amber-400 block mb-1">Pembahasan Singkat:</span>
                      <span className="leading-relaxed text-slate-200">{activeQuestion.question.explanation}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-4 pt-2">
              {feedback?.type === 'success' ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuestion(null);
                    setSelectedOption(null);
                    setFeedback(null);
                    loadArenaData();
                  }}
                  className="w-full px-8 py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>TUTUP & KEMBALI KE ARENA SOAL</span>
                </button>
              ) : (
                <>
                  <div className="text-xs text-slate-400 hidden sm:block">
                    Poin jika benar: <strong className="text-amber-400">+{activeQuestion.question.points} PTS</strong>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveQuestion(null);
                        setSelectedOption(null);
                        setFeedback(null);
                      }}
                      className="px-4 py-3.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1.5"
                    >
                      <span>Batal / Tutup</span>
                    </button>

                    <button
                      type="button"
                      disabled={!selectedOption || !selectedOption.trim() || isSubmitting}
                      onClick={handleSubmitAnswer}
                      className="flex-1 sm:flex-initial px-8 py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>KIRIM JAWABAN</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL HASIL AKHIR SISWA (STUDENT RESULT & PODIUM SCREEN)                 */}
      {/* ========================================================================= */}
      {showResultModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden shadow-2xl shadow-amber-500/25 max-h-[90vh] flex flex-col">
            {/* Header Modal */}
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-3 shrink-0">
              <Trophy className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">
              Pertandingan Selesai!
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Guru telah mengakhiri sesi arena. Berikut adalah hasil perjuangan dan peringkat kamu:
            </p>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-6 text-left">
              {/* Kartu Performa Personal Siswa */}
              {(() => {
                const sortedParticipants = [...allParticipants].sort((a, b) => (b.score || 0) - (a.score || 0));
                const myRank = sortedParticipants.findIndex((p) => p.id === participant?.id) + 1;
                const sortedTeams = [...teams].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
                const myTeam = sortedTeams.find((t) => t.team_name === participant?.team_name);
                const myTeamRank = myTeam ? sortedTeams.indexOf(myTeam) + 1 : null;

                return (
                  <>
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-cyan-500/10 to-amber-500/15 border-2 border-amber-500/50 relative overflow-hidden">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-center sm:text-left">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20 shrink-0">
                            {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎖️'}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                              Hasil Kamu
                            </span>
                            <h4 className="text-lg font-black text-white">{participant?.name || 'Peserta'}</h4>
                            {participant?.team_name && (
                              <span className="text-xs font-semibold text-cyan-300">
                                Kelompok: {participant.team_name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-center sm:text-right">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Peringkat
                            </span>
                            <span className="text-xl sm:text-2xl font-mono font-black text-amber-400">
                              #{myRank > 0 ? myRank : '-'}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              dari {sortedParticipants.length} siswa
                            </span>
                          </div>
                          <div className="h-10 w-[1px] bg-slate-700/60"></div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Skor Akhir
                            </span>
                            <span className="text-xl sm:text-2xl font-mono font-black text-emerald-400">
                              {participant?.score || 0}
                            </span>
                            <span className="text-[10px] text-slate-400 block">PTS</span>
                          </div>
                        </div>
                      </div>

                      {/* Hasil Kelompok jika mode TEAM */}
                      {room.mode === 'TEAM' && myTeam && (
                        <div className="mt-3.5 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
                          <span className="text-slate-300">
                            Peringkat Kelompok <strong className="text-amber-300">{participant?.team_name}</strong>:
                          </span>
                          <span className="font-mono font-bold text-cyan-300">
                            #{myTeamRank || '-'} • Total {myTeam.total_score || 0} PTS
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Podium Juara Top 3 */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block text-center">
                        Podium Juara Kelas ({room.mode === 'TEAM' ? 'Kelompok' : 'Individu'})
                      </span>
                      {(room.mode === 'TEAM' ? sortedTeams : sortedParticipants).slice(0, 3).map((winner, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-2xl border flex items-center justify-between ${
                            idx === 0
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-md shadow-amber-500/10'
                              : idx === 1
                              ? 'bg-slate-800/60 border-slate-700 text-slate-200'
                              : 'bg-slate-900/40 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black text-base text-amber-400">
                              {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : '🥉 #3'}
                            </span>
                            <span className="font-extrabold text-sm">
                              {room.mode === 'TEAM' ? (winner as Team).team_name : (winner as Participant).name}
                            </span>
                          </div>
                          <span className="font-mono font-black text-sm text-amber-400">
                            {room.mode === 'TEAM' ? (winner as Team).total_score : (winner as Participant).score} PTS
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Klasemen Seluruh Siswa */}
                    <div className="pt-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Daftar Lengkap Skor Siswa ({sortedParticipants.length} Orang)
                      </span>
                      <div className="rounded-xl border border-slate-800 overflow-hidden text-xs max-h-48 overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                            <tr>
                              <th className="p-2.5 pl-3">Rank</th>
                              <th className="p-2.5">Nama Siswa</th>
                              <th className="p-2.5">Kelompok</th>
                              <th className="p-2.5 text-right pr-3">Skor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {sortedParticipants.map((p, i) => {
                              const isMe = p.id === participant?.id;
                              return (
                                <tr key={p.id} className={isMe ? 'bg-cyan-500/15 font-bold text-cyan-300' : 'hover:bg-slate-800/30'}>
                                  <td className="p-2.5 pl-3 font-mono">#{i + 1}</td>
                                  <td className="p-2.5">{p.name} {isMe && '(Kamu)'}</td>
                                  <td className="p-2.5 text-slate-400">{p.team_name || '-'}</td>
                                  <td className="p-2.5 text-right pr-3 font-mono font-bold text-amber-400">{p.score}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20 transition-all active:scale-95"
              >
                <Home className="w-4 h-4" />
                <span>Kembali ke Beranda</span>
              </button>

              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all"
              >
                Tutup (Lihat Arena)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentArenaPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-sm font-medium">Memuat Arena Pertandingan...</p>
        </div>
      }
    >
      <StudentArenaContent />
    </React.Suspense>
  );
}
