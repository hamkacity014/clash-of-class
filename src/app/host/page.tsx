'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { createRoom } from '@/lib/store';
import { GameMode } from '@/types';
import { soundFx } from '@/lib/sound';
import { 
  Users, 
  User, 
  Clock, 
  Plus, 
  Trash2, 
  Sparkles, 
  BookOpen, 
  ArrowRight, 
  ArrowLeft, 
  HelpCircle, 
  Loader2, 
  FileText, 
  Sliders,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

export default function HostCreatePage() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState('Pak Guru');
  const [title, setTitle] = useState('Turnamen Sains & Logika Cepat');
  const [mode, setMode] = useState<GameMode>('TEAM');
  const [lockDuration, setLockDuration] = useState<number>(60);
  const [customQuestions, setCustomQuestions] = useState<any[]>([]);
  const [teams, setTeams] = useState<string[]>([
    'Tim Garuda',
    'Tim Rajawali',
    'Tim Harimau',
    'Tim Elang',
  ]);
  const [newTeamName, setNewTeamName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cek jika ada custom draft questions di localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('custom_draft_questions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomQuestions(parsed);
            setTitle('Kuis Soal Mandiri Guru');
          }
        } catch {}
      }
    }
  }, []);

  const handleAddTeam = () => {
    if (newTeamName.trim() && !teams.includes(newTeamName.trim())) {
      setTeams([...teams, newTeamName.trim()]);
      setNewTeamName('');
      soundFx.playClick();
    }
  };

  const handleRemoveTeam = (index: number) => {
    if (teams.length <= 2) {
      alert('Minimal harus ada 2 tim untuk mode kelompok!');
      return;
    }
    setTeams(teams.filter((_, i) => i !== index));
    soundFx.playClick();
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !teacherName.trim()) {
      alert('Harap lengkapi judul room dan nama guru.');
      return;
    }

    if (customQuestions.length < 2) {
      alert('Harap buat minimal 2 soal di Bank Soal Mandiri terlebih dahulu sebelum membuat room kuis!');
      return;
    }

    setIsSubmitting(true);
    soundFx.playSuccess();

    try {
      const { code } = await createRoom({
        teacher_name: teacherName.trim(),
        title: title.trim(),
        mode,
        lock_duration: lockDuration,
        teams: mode === 'TEAM' ? teams : undefined,
        custom_questions: customQuestions,
      });

      router.push(`/host/lobby/${code}`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat room. Silakan coba lagi.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 sm:py-12 w-full">
        {/* Tombol Navigasi Kembali */}
        <div className="mb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-white transition-all shadow-sm group"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400 group-hover:-translate-x-1 transition-transform" />
            <span>Kembali ke Beranda</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Host / Game Master Control
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Buat Sesi Pertandingan Baru
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Atur konfigurasi kelas, pilih paket soal, dan bagikan PIN kepada murid untuk berkompetisi.
          </p>
        </div>

        <form onSubmit={handleCreateRoom} className="space-y-6">
          {/* Card 1: Informasi Dasar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 backdrop-blur-md">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              1. Informasi Kelas & Guru
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nama Guru / Host
                </label>
                <input
                  type="text"
                  required
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="Contoh: Ibu Rina S.Pd"
                  className="w-full bg-slate-950/90 border border-slate-700/80 focus:border-amber-400 rounded-xl px-4 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Judul Sesi / Mata Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Bab 3 - Persamaan Kuadrat"
                  className="w-full bg-slate-950/90 border border-slate-700/80 focus:border-amber-400 rounded-xl px-4 py-2.5 text-sm text-white"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Mode Permainan (Individu vs Kelompok) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 backdrop-blur-md">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              2. Mode Kompetisi
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Mode Kelompok */}
              <div
                onClick={() => {
                  setMode('TEAM');
                  soundFx.playClick();
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'TEAM'
                    ? 'border-cyan-400 bg-cyan-950/30 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Users className="w-5 h-5 text-cyan-400" />
                    <span>Mode Kelompok (Team)</span>
                  </div>
                  {mode === 'TEAM' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Siswa dibagi menjadi beberapa tim. Setiap soal yang dikerjakan oleh satu anggota tim mewakili skor kelompoknya.
                </p>
              </div>

              {/* Mode Individu */}
              <div
                onClick={() => {
                  setMode('INDIVIDUAL');
                  soundFx.playClick();
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'INDIVIDUAL'
                    ? 'border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <User className="w-5 h-5 text-amber-400" />
                    <span>Mode Individu (Free-For-All)</span>
                  </div>
                  {mode === 'INDIVIDUAL' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400"></span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Setiap siswa bermain sendiri. Papan skor mencatat prestasi masing-masing individu secara real-time.
                </p>
              </div>
            </div>

            {/* Konfigurasi Nama Tim jika Mode Kelompok */}
            {mode === 'TEAM' && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 animate-in fade-in">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Daftar Kelompok (Bisa ditambah / diubah):
                </label>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {teams.map((teamName, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200"
                    >
                      <span>{teamName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTeam(idx)}
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Hapus tim"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Nama kelompok baru..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddTeam}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Tim</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Waktu Lock & Paket Soal */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 backdrop-blur-md">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              3. Batas Waktu Kunci Soal & Bank Soal
            </h2>

            {/* Slider Waktu Lock */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Durasi Mengunci Soal per Siswa:
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
                  {lockDuration} Detik
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={120}
                step={15}
                value={lockDuration}
                onChange={(e) => setLockDuration(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>30s (Kilat)</span>
                <span>60s (Standar)</span>
                <span>90s (Sedang)</span>
                <span>120s (Analitis)</span>
              </div>
            </div>

            {/* Paket Soal Mandiri Guru (Wajib Dibuat Terlebih Dahulu) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Paket Soal Pertandingan:
                </label>
                <Link
                  href="/host/questions"
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Editor Bank Soal &rarr;</span>
                </Link>
              </div>

              {customQuestions.length === 0 ? (
                /* Empty State: Belum ada soal dibuat oleh Guru */
                <div className="p-6 rounded-2xl bg-amber-950/20 border border-amber-500/40 text-center space-y-3 animate-in fade-in">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Paket Soal Belum Dibuat</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                      Sesuai format kuis, Guru wajib membuat paket soal terlebih dahulu di Bank Soal Mandiri (minimal 2 soal). Soal dapat diketik manual atau diimpor dari file JSON.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/host/questions"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>BUAT PAKET SOAL SEKARANG</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                /* Ready State: Soal mandiri guru siap digunakan */
                <div className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>Paket Soal Mandiri Siap Digunakan</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/15 px-3 py-1 rounded-full border border-cyan-500/30">
                      {customQuestions.length} Soal Siap
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Total bobot nilai:{' '}
                    <strong className="text-amber-400">
                      {customQuestions.reduce((acc: number, q: any) => acc + (q.points || 100), 0)} PTS
                    </strong>
                    . Seluruh soal ini akan dienkripsi dan diunggah ke database arena kuis untuk diperebutkan siswa.
                  </p>

                  <div className="pt-1 flex items-center justify-between border-t border-slate-800/80 mt-2">
                    <span className="text-[11px] text-slate-500">
                      Ingin menambah atau mengedit soal?
                    </span>
                    <Link
                      href="/host/questions"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Buka Editor Bank Soal &rarr;</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tombol Submit Buat Room */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || customQuestions.length < 2}
              className={`w-full py-4 px-6 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl ${
                customQuestions.length < 2
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/20 active:scale-[0.99]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>MEMBUAT ARENA PERTANDINGAN...</span>
                </>
              ) : customQuestions.length < 2 ? (
                <>
                  <AlertCircle className="w-5 h-5 text-amber-500/70" />
                  <span>BUAT MINIMAL 2 SOAL TERLEBIH DAHULU</span>
                </>
              ) : (
                <>
                  <span>BUKA LOBBY GURU SEKARANG</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
