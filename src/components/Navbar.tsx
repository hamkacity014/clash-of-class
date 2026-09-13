'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX, Swords, ShieldCheck, Database, Radio, Sparkles } from 'lucide-react';
import { soundFx } from '@/lib/sound';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

interface NavbarProps {
  hideHostBtn?: boolean;
}

export default function Navbar({ hideHostBtn }: NavbarProps) {
  const [soundOn, setSoundOn] = useState(true);
  const pathname = usePathname() || '';

  useEffect(() => {
    setSoundOn(soundFx.isSoundEnabled());
  }, []);

  const handleToggleSound = () => {
    const next = soundFx.toggleSound();
    setSoundOn(next);
    if (next) soundFx.playClick();
  };

  // Portal siswa murni jika di beranda murid atau rute permainan murid (/play/*)
  const isStudentPortal = hideHostBtn || pathname === '/' || pathname.startsWith('/play');
  const isHostPage = pathname.startsWith('/host');

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <Link 
          href="/" 
          onClick={() => soundFx.playClick()}
          className="flex items-center gap-3 group transition-transform active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-all border border-amber-400/30">
            <Swords className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-amber-400 via-amber-200 to-cyan-400 bg-clip-text text-transparent">
              CLASH OF CLASS
            </span>
            <div className="text-[10px] uppercase font-semibold tracking-widest text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              Arena Kompetisi Belajar
            </div>
          </div>
        </Link>

        {/* Right Section: Status Indicator, Sound, and Optional Host Action */}
        <div className="flex items-center gap-3">
          {/* Cloud vs Local Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-slate-800 bg-slate-900/90 text-slate-300 shadow-sm">
            {isSupabaseConfigured ? (
              <>
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Supabase Cloud</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300">Local Demo Mode</span>
              </>
            )}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={handleToggleSound}
            aria-label="Toggle Sound"
            className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-colors active:scale-95"
            title={soundOn ? 'Matikan Suara FX' : 'Aktifkan Suara FX'}
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Host Indicator jika di halaman Guru */}
          {isHostPage && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Area Host Guru</span>
            </div>
          )}

          {/* Tombol Dashboard Guru HANYA muncul jika bukan di portal murid */}
          {!isStudentPortal && (
            <Link
              href="/host"
              onClick={() => soundFx.playClick()}
              className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Dashboard Guru</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
