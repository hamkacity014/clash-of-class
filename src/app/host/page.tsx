'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { createRoom } from '@/lib/store';
import { QUESTION_PRESETS } from '@/lib/presets';
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
  HelpCircle,
  Loader2,
  FileText,
  Sliders
} from 'lucide-react';
import Link from 'next/link';

export default function HostCreatePage() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState('Pak Guru');
  const [title, setTitle] = useState('Turnamen Sains & Logika Cepat');
  const [mode, setMode] = useState<GameMode>('TEAM');
  const [lockDuration, setLockDuration] = useState<number>(60);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(QUESTION_PRESETS[0].id);
  const [useCustomQuestions, setUseCustomQuestions] = useState(false);
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
            // Jika ada query param use_custom=1
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get('use_custom') === '1') {
              setUseCustomQuestions(true);
              setTitle('Kuis Soal Mandiri Guru');
            }
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

    if (useCustomQuestions && customQuestions.length === 0) {
      alert('Kamu belum memiliki soal di Bank Soal Mandiri! Silakan buat terlebih dahulu.');
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
        preset_id: useCustomQuestions ? undefined : selectedPresetId,
        custom_questions: useCustomQuestions ? customQuestions : undefined,
      });

      router.push(`/host/lobby/${code}`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat room. Silakan coba lagi.');
      setIsSubmitting(false);
    }
  };

  const selectedPreset = QUESTION_PRESETS.find((p) => p.id === selectedPresetId) || QUESTION_PRESETS[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 sm:py-12 w-full">
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

            {/* Pilihan Sumber Paket Soal */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sumber Paket Soal:
                </label>
                <Link
                  href="/host/questions"
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Buka Editor Bank Soal &rarr;</span>
                </Link>
              </div>

              {/* Toggle Sumber: Preset vs Custom */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomQuestions(false);
                    soundFx.playClick();
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    !useCustomQuestions
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white'
                  }`}
                >
                  Paket Bawaan Sistem
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomQuestions(true);
                    soundFx.playClick();
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    useCustomQuestions
                      ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Bank Soal Mandiri</span>
                  <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-[10px] flex items-center justify-center">
                    {customQuestions.length}
                  </span>
                </button>
              </div>

              {!useCustomQuestions ? (
                /* Daftar Preset */
                <div className="grid grid-cols-1 gap-3">
                  {QUESTION_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        soundFx.playClick();
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                        selectedPresetId === preset.id
                          ? 'border-emerald-400 bg-emerald-950/20 shadow-md shadow-emerald-500/10'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-2">
                          <span>{preset.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-normal">
                            {preset.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{preset.description}</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shrink-0">
                        {preset.questions.length} Soal
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Tampilan Bank Soal Kustom */
                <div className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-cyan-300 font-bold text-sm">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    <span>Paket Soal Mandiri Siap Digunakan</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Saat ini tersimpan <strong>{customQuestions.length} soal</strong> dari editor mandiri Anda. Soal-soal ini akan langsung dipertandingkan di arena.
                  </p>
                  <div className="pt-1">
                    <Link
                      href="/host/questions"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20 transition-all"
                    >
                      <span>Tambah atau Ubah Soal di Editor &rarr;</span>
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
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl font-black text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-xl shadow-amber-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>MEMBUAT ARENA PERTANDINGAN...</span>
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
