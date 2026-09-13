'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import confetti from 'canvas-confetti';
import { 
  getRoomByCode, 
  getRoomQuestions, 
  getParticipantsByRoomId, 
  getTeamsByRoomId, 
  getActivityLogsByRoomId, 
  forceUnlockQuestion, 
  subscribeToRoomEvents,
  exportScoresToCSV,
  finishGame
} from '@/lib/store';
import { Room, Participant, Team, RoomQuestion, ActivityLog, RealtimeEventPayload } from '@/types';
import { soundFx } from '@/lib/sound';
import { 
  Trophy, 
  Lock, 
  Clock, 
  CheckCircle2, 
  Zap, 
  Monitor, 
  Unlock, 
  Radio, 
  Flame, 
  Crown,
  Sparkles,
  Award,
  Download,
  FileSpreadsheet,
  Home
} from 'lucide-react';
import Link from 'next/link';

export default function HostArenaPage() {
  const params = useParams();
  const code = (params?.code as string)?.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [roomQuestions, setRoomQuestions] = useState<RoomQuestion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!code) return;
    const r = await getRoomByCode(code);
    if (!r) return;
    setRoom(r);

    const [rqList, pts, tms, lgList] = await Promise.all([
      getRoomQuestions(r.id),
      getParticipantsByRoomId(r.id),
      getTeamsByRoomId(r.id),
      getActivityLogsByRoomId(r.id),
    ]);

    setRoomQuestions(rqList);
    setParticipants(pts);
    setTeams(tms);
    setLogs(lgList);
  }, [code]);

  useEffect(() => {
    loadData();

    // Dengar event broadcast
    const unsubscribe = subscribeToRoomEvents(code, (payload: RealtimeEventPayload) => {
      loadData();
      if (payload.event === 'QUESTION_LOCKED') {
        soundFx.playLock();
      } else if (payload.event === 'QUESTION_SOLVED') {
        soundFx.playSuccess();
      }
    });

    const interval = setInterval(loadData, 2000);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [code, loadData]);

  // Handler Buka Paksa Kunci Soal (Emergency Teacher Tool)
  const handleForceUnlock = async (rqId: string) => {
    if (!room) return;
    if (confirm('Buka paksa soal ini agar bisa dikerjakan oleh siswa lain?')) {
      soundFx.playClick();
      await forceUnlockQuestion(rqId, room.id);
      loadData();
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
    soundFx.playClick();
  };

  const handleEndGame = async () => {
    if (!room) return;
    if (room.status !== 'FINISHED') {
      if (!confirm('Apakah Anda yakin ingin mengakhiri sesi pertandingan ini? Seluruh tab siswa akan langsung berakhir dan menampilkan hasil.')) {
        return;
      }
      soundFx.playSuccess();
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#F59E0B', '#06B6D4', '#10B981', '#ffffff'],
      });
      await finishGame(room.id);
      await loadData();
    }
    setShowEndModal(true);
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Radio className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Memuat Arena Proyektor Guru {code}...</p>
          </div>
        </div>
      </div>
    );
  }

  // Pengurutan Leaderboard
  const sortedTeams = [...teams].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  const sortedParticipants = [...participants].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      <Navbar />

      <main className="flex-1 max-w-[1600px] mx-auto px-4 py-6 w-full flex flex-col">
        {/* Top Game Master Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-white">{room.title}</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  PIN: {room.code}
                </span>
                {room.status === 'FINISHED' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    PERTANDINGAN SELESAI
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Layar Proyektor Kelas • Host: <strong className="text-white">{room.teacher_name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleFullScreen}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-all"
            >
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span>{isFullScreen ? 'Keluar Fullscreen' : 'Layar Penuh (Proyektor)'}</span>
            </button>

            {room.status === 'FINISHED' && (
              <Link
                href="/"
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
              >
                <Home className="w-4 h-4 text-slate-400" />
                <span>Beranda</span>
              </Link>
            )}

            <button
              onClick={handleEndGame}
              className={`px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 active:scale-95 ${
                room.status === 'FINISHED'
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>{room.status === 'FINISHED' ? 'Lihat Podium & Rekap Nilai' : 'Selesaikan Pertandingan'}</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1">
          {/* Kolom Kiri & Tengah: The Giant Battle Board (3/4 Lebar) */}
          <div className="xl:col-span-3 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-black tracking-wide text-white uppercase">
                  Papan Arena Soal (Live Battle Board)
                </h2>
              </div>
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Tersinkronisasi Real-Time
              </span>
            </div>

            {/* Matrix Kartu Soal Raksasa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1">
              {roomQuestions.map((rq) => {
                const isAvailable = rq.status === 'AVAILABLE';
                const isLocked = rq.status === 'LOCKED';
                const isSolved = rq.status === 'SOLVED';

                let cardSecondsLeft = 0;
                if (isLocked && rq.lock_expires_at) {
                  cardSecondsLeft = Math.max(0, Math.ceil((new Date(rq.lock_expires_at).getTime() - Date.now()) / 1000));
                }

                return (
                  <div
                    key={rq.id}
                    className={`rounded-2xl p-5 border transition-all flex flex-col justify-between min-h-[170px] relative overflow-hidden ${
                      isAvailable
                        ? 'bg-slate-900/60 border-slate-800'
                        : isLocked
                        ? 'bg-amber-950/20 border-amber-500/60 shadow-lg shadow-amber-500/10'
                        : 'bg-emerald-950/20 border-emerald-500/50'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
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
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          isAvailable
                            ? 'bg-slate-800 text-slate-400'
                            : isLocked
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        +{rq.question?.points || 100} PTS
                      </span>
                    </div>

                    {/* Status Display */}
                    <div className="my-auto py-2 text-center">
                      {isAvailable && (
                        <div className="space-y-1">
                          <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold inline-block">
                            TERSEDIA
                          </span>
                          <p className="text-[10px] text-slate-500">Menunggu peserta mengambil</p>
                        </div>
                      )}

                      {isLocked && (
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold animate-pulse">
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span className="truncate max-w-[150px]">{rq.locked_by_name}</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-amber-400 flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{cardSecondsLeft} Detik Tersisa</span>
                          </div>
                        </div>
                      )}

                      {isSolved && (
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>BERHASIL DIJAWAB</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-300 truncate">
                            Oleh {rq.solved_by_name}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer / Guru Emergency Unlock Button */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {isSolved ? 'Selesai' : isLocked ? 'Sedang Dikerjakan' : 'Bebas Rebut'}
                      </span>

                      {isLocked && (
                        <button
                          type="button"
                          onClick={() => handleForceUnlock(rq.id)}
                          className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800 text-[10px] font-bold text-rose-300 hover:bg-rose-900 flex items-center gap-1"
                          title="Buka paksa jika siswa macet/disconnect"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Reset Lock</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kolom Kanan: Leaderboard & Live Activity Ticker (1/4 Lebar) */}
          <div className="space-y-6 flex flex-col">
            {/* Live Leaderboard */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-xl flex-1">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm text-white">
                    {room.mode === 'TEAM' ? 'Klasemen Kelompok' : 'Peringkat Siswa'}
                  </h3>
                </div>
                <Flame className="w-4 h-4 text-amber-500" />
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {room.mode === 'TEAM'
                  ? sortedTeams.map((team, idx) => (
                      <div
                        key={team.id}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          idx === 0
                            ? 'bg-amber-950/20 border-amber-500/40 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-black text-xs text-amber-400 w-4">
                            #{idx + 1}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: team.color || '#06B6D4' }}
                          />
                          <span className="font-bold text-xs truncate max-w-[120px]">
                            {team.team_name}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm text-amber-300">
                          {team.total_score || 0} PTS
                        </span>
                      </div>
                    ))
                  : sortedParticipants.map((p, idx) => (
                      <div
                        key={p.id}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          idx === 0
                            ? 'bg-amber-950/20 border-amber-500/40 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-black text-xs text-amber-400 w-4">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-xs truncate max-w-[120px]">
                            {p.name}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm text-amber-300">
                          {p.score || 0} PTS
                        </span>
                      </div>
                    ))}

                {participants.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">Belum ada skor tercatat.</p>
                )}
              </div>
            </div>

            {/* Live Activity Feed */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-xl h-64 flex flex-col">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">
                  Live Activity Feed
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {logs.map((lg) => (
                  <div
                    key={lg.id}
                    className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-start justify-between gap-2"
                  >
                    <span className="text-slate-300 leading-snug">{lg.text}</span>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {lg.timestamp}
                    </span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <p className="text-xs text-slate-600 italic text-center py-6">
                    Aktivitas kompetisi akan muncul di sini...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL HASIL AKHIR (PODIUM JUARA & EXPORT NILAI)                          */}
      {/* ========================================================================= */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden shadow-2xl shadow-amber-500/30 max-h-[90vh] flex flex-col">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-3 shrink-0">
              <Trophy className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">
              Pertandingan Selesai!
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Selamat kepada para juara atas usaha dan dedikasi strategi terbaik di arena!
            </p>

            {/* Scrollable Recap Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-6 text-left">
              {/* Podium 3 Teratas */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block text-center">
                  Podium Pemenang
                </span>
                {(room.mode === 'TEAM' ? sortedTeams : sortedParticipants).slice(0, 3).map((winner, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      idx === 0
                        ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg shadow-amber-500/10'
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
                    <span className="font-mono font-black text-base text-amber-400">
                      {room.mode === 'TEAM' ? (winner as Team).total_score : (winner as Participant).score} PTS
                    </span>
                  </div>
                ))}
              </div>

              {/* Tabel Lengkap Semua Peserta */}
              <div className="pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Daftar Nilai Seluruh Siswa ({participants.length} Orang)
                </span>
                <div className="rounded-xl border border-slate-800 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-2.5 pl-3">Rank</th>
                        <th className="p-2.5">Nama Siswa</th>
                        <th className="p-2.5">Kelompok</th>
                        <th className="p-2.5 text-right pr-3">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sortedParticipants.map((p, i) => (
                        <tr key={p.id} className="hover:bg-slate-800/30">
                          <td className="p-2.5 pl-3 font-mono text-slate-400">#{i + 1}</td>
                          <td className="p-2.5 font-bold text-white">{p.name}</td>
                          <td className="p-2.5 text-slate-400">{p.team_name || '-'}</td>
                          <td className="p-2.5 text-right pr-3 font-mono font-bold text-amber-400">{p.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Action Buttons: Download CSV & Close */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  soundFx.playSuccess();
                  exportScoresToCSV(room, participants, teams, roomQuestions);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Rekap Nilai (CSV / Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all"
              >
                Tutup Ringkasan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
