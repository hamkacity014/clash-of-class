'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { getRoomByCode, getParticipantsByRoomId, subscribeToRoomEvents } from '@/lib/store';
import { Room, Participant, RealtimeEventPayload } from '@/types';
import { soundFx } from '@/lib/sound';
import { 
  Users, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  Radio
} from 'lucide-react';

export default function StudentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = (params?.code as string)?.toUpperCase();
  const pid = searchParams?.get('pid');

  const [room, setRoom] = useState<Room | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [classmates, setClassmates] = useState<Participant[]>([]);
  
  // Ref untuk mencegah loop pengalihan halaman dan pengulangan audio
  const isRedirectingRef = useRef(false);

  const navigateToArena = useCallback((pId?: string) => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true;
    soundFx.playSuccess();
    const dest = pId ? `/play/arena/${code}?pid=${pId}` : `/play/arena/${code}`;
    router.replace(dest);
  }, [code, router]);

  const loadLobby = useCallback(async () => {
    if (!code || isRedirectingRef.current) return;
    const r = await getRoomByCode(code);
    if (r) {
      setRoom(r);

      const pts = await getParticipantsByRoomId(r.id);
      setClassmates(pts);

      // Prioritas 1: Ambil dari query param pid
      let myP: Participant | null = null;
      if (pid) {
        myP = pts.find(p => p.id === pid) || null;
      }

      // Prioritas 2: Ambil dari sessionStorage (per-tab)
      if (!myP && typeof window !== 'undefined') {
        const sess = sessionStorage.getItem('current_participant_' + r.id);
        if (sess) {
          try { myP = JSON.parse(sess); } catch {}
        }
      }

      // Prioritas 3: Fallback ke localStorage
      if (!myP && typeof window !== 'undefined') {
        const loc = localStorage.getItem('current_participant_' + r.id);
        if (loc) {
          try { myP = JSON.parse(loc); } catch {}
        }
      }

      if (myP) {
        setCurrentParticipant((prev) => (prev?.id === myP?.id ? prev : myP));
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('current_participant_' + r.id, JSON.stringify(myP));
        }
      }

      // Jika game sudah dimulai, langsung alihkan ke arena sekali saja!
      if (r.status === 'ACTIVE' && !isRedirectingRef.current) {
        navigateToArena(myP?.id);
        return;
      }
    }
  }, [code, navigateToArena, pid]);

  useEffect(() => {
    loadLobby();

    // Dengar event real-time GAME_STARTED
    const unsubscribe = subscribeToRoomEvents(code, (payload: RealtimeEventPayload) => {
      if (payload.event === 'GAME_STARTED' && !isRedirectingRef.current) {
        const stored = typeof window !== 'undefined' ? sessionStorage.getItem('current_participant_' + payload.room_id) : null;
        let storedId = '';
        if (stored) {
          try { storedId = JSON.parse(stored).id; } catch {}
        }
        const activePid = pid || storedId || '';
        navigateToArena(activePid);
      } else if (payload.event === 'PARTICIPANT_JOINED') {
        loadLobby();
      }
    });

    const interval = setInterval(loadLobby, 2000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [code, loadLobby, navigateToArena, pid]);

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <Radio className="w-8 h-8 text-cyan-400 animate-pulse mx-auto" />
            <p className="text-slate-400 text-sm">Menghubungkan ke Room {code}...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 sm:py-12 w-full flex flex-col items-center">
        {/* Radar Waiting Animation */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full border-2 border-cyan-500/30 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-radar"></div>
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
              <Zap className="w-8 h-8 text-cyan-400 animate-bounce" />
            </div>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            Terhubung ke Room: {room.code}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white">{room.title}</h1>
          <p className="text-slate-400 text-xs mt-1">
            Host: <strong className="text-white">{room.teacher_name}</strong> • Mode:{' '}
            <strong className="text-amber-400">
              {room.mode === 'TEAM' ? 'Kelompok (Team)' : 'Individu'}
            </strong>
          </p>
        </div>

        {/* Kartu Profil Siswa */}
        {currentParticipant && (
          <div className="w-full max-w-md p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-cyan-500/30 mb-8 shadow-lg shadow-cyan-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold">
                  {currentParticipant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs text-slate-400">Kamu bergabung sebagai:</div>
                  <div className="font-extrabold text-white text-base">
                    {currentParticipant.name}
                  </div>
                </div>
              </div>

              {currentParticipant.team_name ? (
                <div className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  {currentParticipant.team_name}
                </div>
              ) : (
                <div className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium">
                  Individu
                </div>
              )}
            </div>
          </div>
        )}

        {/* Petunjuk Taktik Bertanding */}
        <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-8 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Aturan Main & Taktik Bertanding</span>
          </div>

          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Kunci Soal:</strong> Siapa cepat dia dapat. Saat kamu membuka soal, soal langsung terkunci untuk orang lain selama {room.lock_duration} detik.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Batas Waktu:</strong> Selesaikan soal sebelum {room.lock_duration} detik habis. Jika waktu habis, soal lepas dan teman lain bisa mencuri poinmu!
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Poin:</strong> Pilih tingkat kesulitan dengan bijak (100, 200, atau 300 pts) untuk menduduki puncak leaderboard.
              </span>
            </div>
          </div>
        </div>

        {/* Daftar Teman Sekelas yang Sudah Join */}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold text-slate-400">
              Teman Sekelas yang Sudah Hadir:
            </span>
            <span className="font-mono text-cyan-400 font-bold">
              {classmates.length} Siswa
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {classmates.map((c: Participant) => (
              <div
                key={c.id}
                className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs flex items-center justify-between"
              >
                <span className="text-slate-300 truncate">{c.name}</span>
                {c.team_name ? (
                  <span className="text-[10px] text-amber-400 font-medium truncate ml-2">
                    {c.team_name}
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
