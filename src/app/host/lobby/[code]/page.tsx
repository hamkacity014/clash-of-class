'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { 
  getRoomByCode, 
  getParticipantsByRoomId, 
  getTeamsByRoomId, 
  getQuestionsByRoomId,
  startGame
} from '@/lib/store';
import { Room, Participant, Team, Question } from '@/types';
import { soundFx } from '@/lib/sound';
import { 
  Users, 
  Copy, 
  Check, 
  Play, 
  Sparkles, 
  Layers, 
  Monitor, 
  RefreshCw, 
  HelpCircle,
  Clock,
  Shield
} from 'lucide-react';

export default function HostLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string)?.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [copied, setCopied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const loadData = useCallback(async () => {
    if (!code) return;
    const r = await getRoomByCode(code);
    if (r) {
      setRoom(r);
      const [pts, tms, qts] = await Promise.all([
        getParticipantsByRoomId(r.id),
        getTeamsByRoomId(r.id),
        getQuestionsByRoomId(r.id),
      ]);
      setParticipants(pts);
      setTeams(tms);
      setQuestions(qts);
    }
  }, [code]);

  useEffect(() => {
    loadData();
    // Polling interval 2 detik agar siswa baru langsung terdeteksi
    const interval = setInterval(() => {
      loadData();
    }, 2000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?pin=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    soundFx.playClick();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    if (!room) return;
    soundFx.playSuccess();
    await startGame(room.id);
    router.push(`/host/arena/${code}`);
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

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm font-medium">Memuat Lobby Room {code}...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 sm:py-10 w-full flex flex-col justify-between">
        {/* Top Header Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl mb-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-cyan-400 to-amber-400"></div>

          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Info Kiri */}
            <div className="text-center lg:text-left space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-2">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                Host: {room.teacher_name}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">{room.title}</h1>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Mode: <strong className="text-white">{room.mode === 'TEAM' ? 'Kelompok' : 'Individu'}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Lock: <strong className="text-white">{room.lock_duration}s per soal</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Total: <strong className="text-white">{questions.length} Soal</strong>
                </span>
              </div>
            </div>

            {/* Kotak PIN Raksasa (Untuk Proyektor Depan Kelas) */}
            <div className="bg-slate-950/90 border-2 border-cyan-500/40 rounded-2xl p-5 sm:p-6 text-center shadow-lg shadow-cyan-500/10 min-w-[280px]">
              <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400 block mb-1">
                KODE PIN UNTUK SISWA:
              </span>
              <div className="text-4xl sm:text-5xl font-mono font-black tracking-widest text-white mb-3">
                {room.code}
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 flex items-center gap-1.5 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Tersalin!' : 'Salin Tautan'}</span>
                </button>
                <button
                  onClick={toggleFullScreen}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 flex items-center gap-1.5 transition-all"
                >
                  <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isFullScreen ? 'Keluar Full' : 'Mode Proyektor'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Grid Peserta / Kelompok */}
        <div className="flex-1 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Peserta di Ruang Tunggu</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold">
                {participants.length} Siswa Terhubung
              </span>
            </div>
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Live Sync
            </span>
          </div>

          {participants.length === 0 ? (
            <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center mx-auto text-slate-500 animate-pulse">
                <Users className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-slate-300">Belum ada siswa yang masuk</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tampilkan kode PIN <span className="font-mono text-cyan-400 font-bold">{room.code}</span> ke proyektor di kelas agar siswa dapat mengetiknya di HP masing-masing.
              </p>
            </div>
          ) : room.mode === 'TEAM' ? (
            /* Tampilan Berkelompok */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {teams.map((team) => {
                const teamMembers = participants.filter((p) => p.team_id === team.id || p.team_name === team.team_name);
                return (
                  <div
                    key={team.id}
                    className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                        <span className="font-bold text-sm text-white flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: team.color || '#06B6D4' }}
                          />
                          {team.team_name}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {teamMembers.length} Orang
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {teamMembers.map((m) => (
                          <div
                            key={m.id}
                            className="text-xs text-slate-300 px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-[10px] text-emerald-400">Siap</span>
                          </div>
                        ))}
                        {teamMembers.length === 0 && (
                          <p className="text-xs text-slate-600 italic py-2">Menunggu anggota tim...</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Tampilan Individu */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all text-center space-y-1"
                >
                  <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs mx-auto">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-bold text-xs text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-emerald-400 font-mono">Siap Tanding</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Pastikan seluruh siswa sudah masuk ke kelompok masing-masing sebelum memulai.</span>
          </div>

          <button
            onClick={handleStartGame}
            disabled={participants.length === 0}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>MULAI PERTANDINGAN SEKARANG</span>
          </button>
        </div>
      </main>
    </div>
  );
}
