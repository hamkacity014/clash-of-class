'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Swords, Lock, Zap, Trophy, Users, ArrowRight, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { getRoomByCode, getTeamsByRoomId, joinRoom } from '@/lib/store';
import { Room, Team } from '@/types';
import { soundFx } from '@/lib/sound';

export default function HomePage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto check PIN saat 6 digit terisi
  const handlePinChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setPin(val);
    setErrorMsg('');

    if (val.length === 6) {
      setIsLoading(true);
      try {
        const foundRoom = await getRoomByCode(val);
        if (foundRoom) {
          setRoom(foundRoom);
          soundFx.playJoin();
          if (foundRoom.mode === 'TEAM') {
            const teamList = await getTeamsByRoomId(foundRoom.id);
            setTeams(teamList);
            if (teamList.length > 0) setSelectedTeamId(teamList[0].id);
          }
        } else {
          setRoom(null);
          setErrorMsg('Kode Room tidak ditemukan. Periksa kembali PIN dari guru Anda.');
        }
      } catch {
        setErrorMsg('Gagal memeriksa kode room. Coba lagi.');
      } finally {
        setIsLoading(false);
      }
    } else {
      setRoom(null);
      setTeams([]);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 6) {
      setErrorMsg('Masukkan 6 digit kode room.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Silakan masukkan nama Anda.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      let targetRoom = room;
      if (!targetRoom) {
        targetRoom = await getRoomByCode(pin);
      }

      if (!targetRoom) {
        setErrorMsg('Room tidak ditemukan.');
        setIsLoading(false);
        return;
      }

      let selectedTeamName: string | undefined;
      if (targetRoom.mode === 'TEAM') {
        const selected = teams.find((t) => t.id === selectedTeamId);
        selectedTeamName = selected?.team_name;
      }

      const joinedP = await joinRoom({
        room_id: targetRoom.id,
        name: name.trim(),
        team_id: targetRoom.mode === 'TEAM' ? selectedTeamId : null,
        team_name: selectedTeamName,
      });

      soundFx.playSuccess();
      router.push(`/play/lobby/${targetRoom.code}?pid=${joinedP.id}`);
    } catch {
      setErrorMsg('Gagal masuk ke room. Silakan coba lagi.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 sm:py-16 flex flex-col items-center justify-center">
        {/* Header Hero */}
        <div className="text-center max-w-2xl mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Platform Gamifikasi Pembelajaran Generasi Baru
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
            Berebut Soal,{' '}
            <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-cyan-400 bg-clip-text text-transparent">
              Kunci Kemenangan
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Rasakan sensasi kuis akademik paling seru. Buka soal sebelum diambil lawan, 
            selesaikan dalam waktu 60 detik, atau biarkan lawan mencuri poinmu!
          </p>
        </div>

        {/* Card Masuk Room Siswa */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-xl relative overflow-hidden mb-16">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-cyan-500 to-amber-500"></div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Gabung ke Arena</h2>
              <p className="text-xs text-slate-400">Masukkan kode PIN dari Guru Anda</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            {/* Input PIN */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Kode Room (PIN 6 Digit)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  value={pin}
                  onChange={handlePinChange}
                  placeholder="Contoh: CLAS88"
                  className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl px-4 py-3 text-center text-xl font-mono font-bold tracking-widest text-cyan-300 placeholder:text-slate-600 transition-all uppercase"
                />
                {isLoading && (
                  <div className="absolute right-3 top-3.5">
                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Jika Room ditemukan, tampilkan info preview */}
            {room && (
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mata Pelajaran:</span>
                  <span className="font-semibold text-white">{room.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Guru / Host:</span>
                  <span className="font-semibold text-cyan-300">{room.teacher_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mode Permainan:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {room.mode === 'TEAM' ? 'Kelompok (Team)' : 'Individu'}
                  </span>
                </div>
              </div>
            )}

            {/* Input Nama Peserta */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Nama Lengkap / Panggilan
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masukkan nama Anda"
                maxLength={30}
                className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 transition-all"
              />
            </div>

            {/* Pemilihan Kelompok (jika mode TEAM) */}
            {room && room.mode === 'TEAM' && teams.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Pilih Kelompok Anda
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {teams.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => {
                        setSelectedTeamId(t.id);
                        soundFx.playClick();
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between ${
                        selectedTeamId === t.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 shadow-sm shadow-cyan-500/20'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{t.team_name}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: t.color || '#06B6D4' }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Tombol Masuk */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>MASUK KE ARENA</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-amber-500/40 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-white mb-2">Atomic Lock 60 Detik</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Saat soal dibuka oleh satu peserta/tim, soal terkunci otomatis. Siswa lain tidak bisa membuka sebelum waktu habis.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-white mb-2">Real-Time Steal Window</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Gagal menjawab atau kehabisan waktu? Soal otomatis terbuka kembali untuk direbut oleh kelompok atau siswa lain!
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/40 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-white mb-2">Papan Skor & Proyektor TV</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Tampilan khusus proyektor kelas dengan podium animasi dan suara game arcade yang memacu semangat belajar.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        Clash of Class — Dibuat untuk pembelajaran aktif & kompetitif. Siap dihosting di Vercel.
      </footer>
    </div>
  );
}
