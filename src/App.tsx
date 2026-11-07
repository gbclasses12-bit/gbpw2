/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BookOpen, Send, Sparkles, ExternalLink } from 'lucide-react';

export default function App() {
  useEffect(() => {
    // If mounted on root in client SPA, smoothly redirect to study batches
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.location.replace('/study/batches');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-white font-sans">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60 blur-md animate-pulse" />
          <img
            src="https://i.ibb.co/Q3g9fGSt/1791541921524.png"
            alt="GB STUDY Logo"
            className="relative w-24 h-24 rounded-full object-cover border-2 border-emerald-400 shadow-lg"
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            GB STUDY
          </h1>
          <p className="text-sm text-slate-400">
            Free online study batches, high-quality lectures, notes, DPPs, and comprehensive test series.
          </p>
        </div>

        <div className="w-full space-y-3 pt-2">
          <a
            href="/study/batches"
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
          >
            <BookOpen className="w-5 h-5" />
            <span>Open Batches & Study</span>
          </a>

          <a
            href="https://t.me/GBFreestudy"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 font-semibold transition-all active:scale-[0.98]"
          >
            <Send className="w-5 h-5" />
            <span>Join GB STUDY Telegram</span>
            <ExternalLink className="w-4 h-4 opacity-70" />
          </a>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-800/80 w-full justify-center">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>All batches, lectures, notes & tests mirrored 100% free</span>
        </div>
      </div>
    </div>
  );
}
