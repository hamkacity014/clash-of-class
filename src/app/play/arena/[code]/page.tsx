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
  getParticipantsByRoomId
} from '@/lib/store';
import { Room, Participant, RoomQuestion, RealtimeEventPayload } from '@/types';
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
  Radio
} from 'lucide-react';

export default function StudentArenaPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = (params?.code as string)?.toUpperCase();
  const pid = searchParams?.get('pid');

  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [roomQuestions, setRoomQuestions] = useState<RoomQuestion[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<RoomQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(60);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

    const [pts, rqList] = await Promise.all([
      getParticipantsByRoomId(r.id),
      getRoomQuestions(r.id),
    ]);
    setRoomQuestions(rqList);

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

      // Waktu habis!
      if (diff <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        soundFx.playLock();
        setActiveQuestion(null);
        setSelectedOption(null);
        showToast('Waktu 60 detik habis! Soal lepas dan dapat direbut lawan.');
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

      if (payload.event === 'QUESTION_LOCKED') {
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

  // Handler: Buka & Kunci Soal
  const handleLockQuestion = async (rq: RoomQuestion) => {
    if (!participant || !room) return;
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
    if (!activeQuestion || !participant || !selectedOption) {
      alert('Pilih salah satu jawaban terlebih dahulu!');
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

        setTimeout(() => {
          setActiveQuestion(null);
          setSelectedOption(null);
          setFeedback(null);
          loadArenaData();
        }, 3200);
      } else {
        soundFx.playLock();
        setFeedback({
          type: 'error',
          message: `Jawaban Kurang Tepat! Kunci jawaban adalah (${res.correctAnswer}). Soal lepas ke peserta lain.`,
        });

        setTimeout(() => {
          setActiveQuestion(null);
          setSelectedOption(null);
          setFeedback(null);
          loadArenaData();
        }, 3600);
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
        <Navbar />
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
      <Navbar />

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

            return (
              <div
                key={rq.id}
                className={`relative rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between min-h-[160px] ${
                  isAvailable
                    ? 'bg-slate-900/70 border-slate-700/80 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer group'
                    : isLocked
                    ? 'bg-amber-950/20 border-amber-500/50 animate-cyber-pulse'
                    : 'bg-emerald-950/20 border-emerald-500/40 opacity-90'
                }`}
                onClick={() => {
                  if (isAvailable) handleLockQuestion(rq);
                }}
              >
                {/* Header Kartu */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-black text-sm text-slate-300">
                    SOAL #{rq.question?.order_index}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      isAvailable
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
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
                    <div className="text-center space-y-1">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center justify-center gap-1.5">
                        <Zap className="w-4 h-4 text-cyan-400 group-hover:scale-125 transition-transform" />
                        KLIK UNTUK KUNCI
                      </span>
                      <p className="text-[10px] text-slate-500">Batas pengerjaan 60 detik</p>
                    </div>
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
      </main>

      {/* ========================================================================= */}
      {/* MODAL PENGERJAAN SOAL (SOLVER WORKSPACE) - HANYA UNTUK SISWA PENGUNCI     */}
      {/* ========================================================================= */}
      {activeQuestion && activeQuestion.question && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-500/20 relative overflow-hidden flex flex-col">
            {/* Top Glowing Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500"></div>

            {/* Modal Header: Nomor Soal, Timer Melingkar, & Nilai Poin */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  Kamu Sedang Mengunci:
                </span>
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

            {/* Pilihan Ganda (A, B, C, D) */}
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

            {/* Feedback Alert (Jika benar/salah) */}
            {feedback && (
              <div className="space-y-3 mb-4 animate-in zoom-in-95">
                <div
                  className={`p-4 rounded-2xl border text-sm font-bold flex items-center gap-2 ${
                    feedback.type === 'success'
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                      : 'border-rose-500 bg-rose-950/60 text-rose-300'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>

                {/* Pembahasan Edukatif Soal */}
                {activeQuestion.question.explanation && (
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                    <span className="text-base">💡</span>
                    <div>
                      <span className="font-bold text-amber-400 block mb-0.5">Pembahasan Singkat:</span>
                      <span className="leading-relaxed">{activeQuestion.question.explanation}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Button: Kirim Jawaban */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <div className="text-xs text-slate-400 hidden sm:block">
                Poin jika benar: <strong className="text-amber-400">+{activeQuestion.question.points} PTS</strong>
              </div>

              <button
                type="button"
                disabled={!selectedOption || isSubmitting || Boolean(feedback)}
                onClick={handleSubmitAnswer}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
              >
                <span>KIRIM JAWABAN SEKARANG</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
