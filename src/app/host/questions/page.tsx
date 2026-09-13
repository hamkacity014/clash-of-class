'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Question, QuestionOption } from '@/types';
import { exportQuestionsToJSON, parseQuestionsFromJSON } from '@/lib/store';
import { soundFx } from '@/lib/sound';
import { 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  ArrowRight, 
  CheckCircle2, 
  HelpCircle, 
  Sparkles, 
  BookOpen,
  FileJson,
  Layers
} from 'lucide-react';

type DraftQuestion = Omit<Question, 'id' | 'room_id'>;

export default function QuestionBankPage() {
  const router = useRouter();

  const [packageTitle, setPackageTitle] = useState('Paket Soal Kustom');
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  
  // Form state
  const [questionText, setQuestionText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [points, setPoints] = useState<number>(100);
  const [explanation, setExplanation] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Load draft dari LocalStorage jika ada
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('custom_draft_questions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuestions(parsed);
          }
        } catch {}
      }
    }
  }, []);

  const saveToLocalStorage = (newQuestions: DraftQuestion[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_draft_questions', JSON.stringify(newQuestions));
    }
  };

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || !optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
      alert('Harap isi teks pertanyaan dan keempat pilihan jawaban (A, B, C, D)!');
      return;
    }

    const newQ: DraftQuestion = {
      question_text: questionText.trim(),
      options: [
        { label: 'A', text: optA.trim() },
        { label: 'B', text: optB.trim() },
        { label: 'C', text: optC.trim() },
        { label: 'D', text: optD.trim() },
      ],
      correct_answer: correctAnswer,
      points,
      order_index: questions.length + 1,
      explanation: explanation.trim() || undefined,
    };

    const updated = [...questions, newQ];
    setQuestions(updated);
    saveToLocalStorage(updated);
    soundFx.playClick();

    // Reset Form
    setQuestionText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setExplanation('');
    setCorrectAnswer('A');
    setPoints(100);

    setSuccessToast(`Soal #${updated.length} berhasil ditambahkan!`);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  const handleDeleteQuestion = (idx: number) => {
    const updated = questions.filter((_, i) => i !== idx).map((q, i) => ({
      ...q,
      order_index: i + 1,
    }));
    setQuestions(updated);
    saveToLocalStorage(updated);
    soundFx.playClick();
  };

  // Export ke file JSON
  const handleExportJSON = () => {
    if (questions.length === 0) {
      alert('Tambahkan minimal 1 soal sebelum mengekspor!');
      return;
    }
    soundFx.playSuccess();
    exportQuestionsToJSON(questions, packageTitle);
  };

  // Import dari file JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseQuestionsFromJSON(content);
        setQuestions(parsed);
        saveToLocalStorage(parsed);
        soundFx.playSuccess();
        alert(`Berhasil memuat ${parsed.length} soal dari file JSON!`);
      } catch (err) {
        alert('Gagal membaca file JSON: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Lanjut buat room dengan paket ini
  const handleUseInRoom = () => {
    if (questions.length === 0) {
      alert('Tambahkan minimal 2 soal untuk membuat sesi kuis!');
      return;
    }
    saveToLocalStorage(questions);
    soundFx.playSuccess();
    router.push('/host?use_custom=1');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 sm:py-10 w-full">
        {/* Header Title & Actions */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-2">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              Bank Soal Mandiri
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              Kelola & Kustomisasi Soal Kuis
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Buat paket soal baru, atur poin, atau impor/ekspor file JSON untuk dipakai di kelas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Import Button */}
            <label className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer transition-all">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>

            {/* Export Button */}
            <button
              onClick={handleExportJSON}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export JSON</span>
            </button>

            {/* Gunakan di Room Button */}
            <button
              onClick={handleUseInRoom}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
            >
              <span>Gunakan di Room ({questions.length} Soal)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Kolom Kiri: Form Input Soal (7 Kolom) */}
          <div className="lg:col-span-7">
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-xl">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  Tambah Pertanyaan Baru
                </h2>
                <span className="text-xs font-mono text-cyan-400 font-bold">
                  Soal #{questions.length + 1}
                </span>
              </div>

              {successToast && (
                <div className="p-3 mb-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{successToast}</span>
                </div>
              )}

              <form onSubmit={handleAddQuestion} className="space-y-4">
                {/* Judul Pertanyaan */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Teks Pertanyaan *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Tuliskan pertanyaan di sini..."
                    className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 rounded-xl px-4 py-2.5 text-sm text-white resize-none"
                  />
                </div>

                {/* 4 Opsi Jawaban */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pilihan Jawaban (A, B, C, D) *
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 font-mono font-bold text-xs text-amber-400">A</span>
                      <input
                        type="text"
                        required
                        value={optA}
                        onChange={(e) => setOptA(e.target.value)}
                        placeholder="Jawaban A"
                        className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3 font-mono font-bold text-xs text-amber-400">B</span>
                      <input
                        type="text"
                        required
                        value={optB}
                        onChange={(e) => setOptB(e.target.value)}
                        placeholder="Jawaban B"
                        className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3 font-mono font-bold text-xs text-amber-400">C</span>
                      <input
                        type="text"
                        required
                        value={optC}
                        onChange={(e) => setOptC(e.target.value)}
                        placeholder="Jawaban C"
                        className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white"
                      />
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3 font-mono font-bold text-xs text-amber-400">D</span>
                      <input
                        type="text"
                        required
                        value={optD}
                        onChange={(e) => setOptD(e.target.value)}
                        placeholder="Jawaban D"
                        className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Kunci Jawaban & Bobot Poin */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Kunci Jawaban Benar
                    </label>
                    <select
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value as 'A' | 'B' | 'C' | 'D')}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold"
                    >
                      <option value="A">Pilihan A</option>
                      <option value="B">Pilihan B</option>
                      <option value="C">Pilihan C</option>
                      <option value="D">Pilihan D</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Bobot Poin
                    </label>
                    <select
                      value={points}
                      onChange={(e) => setPoints(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold"
                    >
                      <option value={100}>100 PTS (Mudah)</option>
                      <option value={200}>200 PTS (Sedang)</option>
                      <option value={300}>300 PTS (Sulit)</option>
                    </select>
                  </div>
                </div>

                {/* Pembahasan Soal (Edukatif) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Pembahasan / Alasan Jawaban (Opsional)
                  </label>
                  <input
                    type="text"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Contoh: Mengapa jawaban tersebut benar..."
                    className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 rounded-xl px-4 py-2 text-xs text-white"
                  />
                </div>

                {/* Tombol Simpan Soal */}
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 active:scale-98 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>TAMBAH KE DAFTAR SOAL</span>
                </button>
              </form>
            </div>
          </div>

          {/* Kolom Kanan: List Soal yang Sudah Terdaftar (5 Kolom) */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-sm text-white">Daftar Soal Tersimpan</h3>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                  {questions.length} Soal
                </span>
              </div>

              {/* List Kartu Soal */}
              <div className="flex-1 overflow-y-auto space-y-3 max-h-[500px] pr-1">
                {questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs space-y-2 group hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-slate-200 line-clamp-2 leading-snug">
                        #{q.order_index}. {q.question_text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors shrink-0"
                        title="Hapus soal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                      <span className="text-emerald-400 font-bold">Kunci: ({q.correct_answer})</span>
                      <span className="text-amber-400 font-bold">+{q.points} PTS</span>
                    </div>

                    {q.explanation && (
                      <p className="text-[10px] text-slate-500 italic bg-slate-900/80 p-1.5 rounded-lg">
                        💡 {q.explanation}
                      </p>
                    )}
                  </div>
                ))}

                {questions.length === 0 && (
                  <div className="text-center py-12 text-slate-600 space-y-2">
                    <FileJson className="w-10 h-10 mx-auto text-slate-700" />
                    <p className="text-xs">Belum ada soal kustom.</p>
                    <p className="text-[10px] text-slate-600">
                      Gunakan form di samping atau klik tombol &quot;Import JSON&quot; di atas.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
