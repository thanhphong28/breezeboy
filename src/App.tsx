/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { Menu, ArrowRight, Mail, MapPin, Moon, Sun, Radio, Loader2, ExternalLink, Send, Mic, Copy, Check } from "lucide-react";
import InteractiveBackground from "./components/InteractiveBackground";
import MusicPlayer from "./components/MusicPlayer";
import Lenis from "lenis";
import { content, initialLyricGreeting, type Language } from "./copy";

type LyricMessage = { role: "user" | "bot"; content: string };
type LyricDiagnostic = {
  status?: number;
  message: string;
};
type BeatDiagnostic = {
  status?: number;
  message: string;
};
type BeatResult = {
  id: string;
  title: string;
  artist: string;
  duration?: string;
  thumbnail?: string;
  url: string;
  previewUrl?: string;
};

const getInitialLanguage = (): Language => {
  if (typeof window === "undefined") return "vi";
  const saved = window.localStorage.getItem("velora-language");
  return saved === "en" || saved === "vi" ? saved : "vi";
};

function AnimatedText({ text }: { text: string }) {
  return (
    <>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${text}-${i}`}
          variants={{
            hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration: 0.6, ease: "easeOut" },
            },
          }}
          className="inline-block"
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </>
  );
}

export default function App() {
  const { scrollYProgress } = useScroll();
  const logoScale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.1, 1]);
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const copy = content[language];

  const [beatQuery, setBeatQuery] = useState("");
  const [beatResults, setBeatResults] = useState<BeatResult[]>([]);
  const [selectedBeat, setSelectedBeat] = useState<BeatResult | null>(null);
  const [isSearchingBeat, setIsSearchingBeat] = useState(false);
  const [beatError, setBeatError] = useState<string | null>(null);
  const [beatDiagnostic, setBeatDiagnostic] = useState<BeatDiagnostic | null>(null);
  const [copiedBeatUrl, setCopiedBeatUrl] = useState<string | null>(null);
  const [isBeatPreviewPlaying, setIsBeatPreviewPlaying] = useState(false);

  const [lyricMessages, setLyricMessages] = useState<LyricMessage[]>([
    { role: "bot", content: initialLyricGreeting[getInitialLanguage()] },
  ]);
  const [currentLyricInput, setCurrentLyricInput] = useState("");
  const [isGeneratingLyric, setIsGeneratingLyric] = useState(false);
  const [lyricDiagnostic, setLyricDiagnostic] = useState<LyricDiagnostic | null>(null);

  const handleSearchBeat = async () => {
    if (!beatQuery.trim()) return;

    setIsSearchingBeat(true);
    setBeatError(null);
    setBeatDiagnostic(null);
    setBeatResults([]);
    setSelectedBeat(null);
    setIsBeatPreviewPlaying(false);

    try {
      const res = await fetch(`/api/beats?q=${encodeURIComponent(beatQuery)}`);
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || copy.ai.beatError;
        setBeatError(errorMessage);
        setBeatDiagnostic({
          status: res.status,
          message: errorMessage,
        });
      } else {
        const results = Array.isArray(data?.results) ? data.results : [];
        setBeatResults(results);
        setSelectedBeat(results[0] || null);
        setIsBeatPreviewPlaying(false);
        if (!results.length) {
          setBeatError(copy.ai.beatNoResults);
        }
      }
    } catch (err) {
      console.error("Beat search error:", err);
      setBeatError(copy.ai.beatError);
      setBeatDiagnostic({
        message: copy.ai.beatError,
      });
    } finally {
      setIsSearchingBeat(false);
    }
  };

  const handleCopyBeatLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedBeatUrl(url);
      window.setTimeout(() => {
        setCopiedBeatUrl((current) => (current === url ? null : current));
      }, 2000);
    } catch (error) {
      console.error("Copy beat link error:", error);
      setBeatDiagnostic({
        message: copy.ai.beatCopyError,
      });
    }
  };

  const handleGenerateLyric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLyricInput.trim() || isGeneratingLyric) return;

    const userMessage = currentLyricInput;
    setLyricMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setCurrentLyricInput("");
    setIsGeneratingLyric(true);
    setLyricDiagnostic(null);

    try {
      const res = await fetch("/api/studio/generate-lyric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history: lyricMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || copy.ai.lyricFailed;
        setLyricMessages((prev) => [...prev, { role: "bot", content: errorMessage }]);
        setLyricDiagnostic({
          status: res.status,
          message: errorMessage,
        });
      } else {
        setLyricDiagnostic(null);
        setLyricMessages((prev) => [...prev, { role: "bot", content: data.text || copy.ai.noResponse }]);
      }
    } catch (err) {
      console.error("Lyric generation error:", err);
      setLyricDiagnostic({
        message: copy.ai.lyricError,
      });
      setLyricMessages((prev) => [...prev, { role: "bot", content: copy.ai.lyricError }]);
    } finally {
      setIsGeneratingLyric(false);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("velora-language", language);
  }, [language]);

  useEffect(() => {
    setLyricMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === "bot") {
        return [{ role: "bot", content: initialLyricGreeting[language] }];
      }
      return prev;
    });
  }, [language]);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-background selection:bg-foreground/10 selection:text-foreground">
      <div className="fixed inset-0 z-0">
        <InteractiveBackground />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6">
        <div className="liquid-glass flex w-full max-w-7xl items-center justify-between rounded-full px-8 py-4">
          <motion.div className="flex items-center gap-2" style={{ scale: logoScale }}>
            <span className="font-display text-3xl tracking-tight text-foreground">
              Breeze Boy<sup className="text-xs font-sans">®</sup>
            </span>
          </motion.div>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#home" className="text-sm font-medium text-foreground transition-all hover:opacity-80">{copy.nav.home}</a>
            <a href="#studio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all">{copy.nav.studio}</a>
            <a href="#music" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all">{copy.nav.music}</a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all">{copy.nav.about}</a>
            <a href="#journal" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all">{copy.nav.journal}</a>
            <a href="#contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all">{copy.nav.contact}</a>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setIsDark(!isDark)} className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-all active:scale-[0.95]" aria-label={copy.nav.toggleTheme}>
              <AnimatePresence mode="wait">
                <motion.div key={isDark ? "moon" : "sun"} initial={{ opacity: 0, rotate: -90, scale: 0.5 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 90, scale: 0.5 }} transition={{ duration: 0.3 }}>
                  {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </motion.div>
              </AnimatePresence>
            </button>

            <button onClick={() => setLanguage((prev) => (prev === "en" ? "vi" : "en"))} className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold tracking-widest text-foreground transition-all active:scale-[0.95]" aria-label={copy.nav.toggleLanguage} title={copy.nav.toggleLanguage}>
              {language === "en" ? "EN" : "VI"}
            </button>

            <button className="liquid-glass group rounded-full px-6 py-2 text-sm font-medium text-foreground transition-all active:scale-[0.98]">{copy.nav.begin}</button>
            <button className="md:hidden text-foreground p-2">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      <section id="home" className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="max-w-7xl">
          <motion.h1 initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }} className="font-display text-5xl font-normal leading-[0.95] tracking-[-2.46px] text-foreground sm:text-7xl md:text-8xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
            <AnimatedText text={copy.hero.lead} />
            <em className="not-italic text-muted-foreground"><AnimatedText text={copy.hero.accent} /></em>
            <AnimatedText text={copy.hero.bridge} />
            <br className="hidden sm:block" />
            <em className="not-italic text-muted-foreground"><AnimatedText text={copy.hero.end} /></em>
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ opacity: { repeat: Infinity, duration: 0.8, ease: "easeInOut" }, delay: 3 }} className="inline-block w-[4px] h-[0.8em] bg-muted-foreground/40 ml-2 align-middle" />
          </motion.h1>

          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animation: "fade-rise 0.8s ease-out 2.8s both" }}>
            {copy.hero.body}
          </p>

          <div className="mt-12" style={{ animation: "fade-rise 0.8s ease-out 3.2s both" }}>
            <a href="#studio" className="liquid-glass inline-block rounded-full px-8 py-3 text-base font-medium text-foreground transition-transform active:scale-[0.98] cursor-pointer">
              {copy.hero.cta}
            </a>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 1 }} className="flex flex-col items-center gap-2">
            <div className="h-12 w-[1px] bg-gradient-to-b from-foreground/20 to-transparent" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">{copy.hero.scroll}</span>
          </motion.div>
        </div>
      </section>

      <section id="studio" className="relative z-10 min-h-screen px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 md:grid-cols-2">
            <div className="flex flex-col justify-center">
              <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.studio.label}</span>
              <h2 className="mt-6 font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {copy.studio.titleTop} <br />
                <em className="italic text-muted-foreground">{copy.studio.titleAccent}</em>
              </h2>
              <p className="mt-8 text-lg leading-relaxed text-muted-foreground">{copy.studio.body}</p>
              <div className="mt-10 flex gap-4">
                <button className="flex items-center gap-2 text-sm font-medium text-foreground transition-all hover:gap-4">
                  {copy.studio.button} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="liquid-glass aspect-[4/5] rounded-3xl p-8 flex flex-col justify-end">
                <span className="text-2xl font-display italic">01</span>
                <p className="mt-2 text-sm text-muted-foreground">{copy.studio.card1}</p>
              </div>
              <div className="liquid-glass mt-12 aspect-[4/5] rounded-3xl p-8 flex flex-col justify-end">
                <span className="text-2xl font-display italic">02</span>
                <p className="mt-2 text-sm text-muted-foreground">{copy.studio.card2}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MusicPlayer language={language} />

      <section id="about" className="relative z-10 min-h-screen px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="liquid-glass rounded-[40px] p-12 md:p-24">
            <div className="max-w-3xl">
              <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.about.label}</span>
              <h2 className="mt-8 font-display text-4xl leading-tight text-foreground sm:text-7xl">
                {copy.about.titleTop} <br />
                <em className="italic text-muted-foreground">{copy.about.titleAccent}</em>
              </h2>
              <p className="mt-12 text-xl leading-relaxed text-muted-foreground">{copy.about.body}</p>
              <div className="mt-16 grid gap-12 sm:grid-cols-3">
                <div><span className="block text-3xl font-display">12+</span><span className="mt-2 block text-xs uppercase tracking-widest text-muted-foreground">{copy.about.awards}</span></div>
                <div><span className="block text-3xl font-display">85k</span><span className="mt-2 block text-xs uppercase tracking-widest text-muted-foreground">{copy.about.users}</span></div>
                <div><span className="block text-3xl font-display">0.0s</span><span className="mt-2 block text-xs uppercase tracking-widest text-muted-foreground">{copy.about.latency}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="journal" className="relative z-10 min-h-screen px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex items-end justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.journal.label}</span>
              <h2 className="mt-4 font-display text-4xl text-foreground sm:text-6xl">{copy.journal.title}</h2>
            </div>
            <button className="hidden text-sm font-medium text-muted-foreground hover:text-foreground transition-all md:block">{copy.journal.button}</button>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="group cursor-pointer">
                <div className="liquid-glass aspect-video rounded-2xl overflow-hidden">
                  <div className="h-full w-full bg-foreground/5 transition-transform duration-700 group-hover:scale-110" />
                </div>
                <div className="mt-6">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{copy.journal.meta}</span>
                  <h3 className="mt-2 text-xl font-medium text-foreground group-hover:text-muted-foreground transition-colors">{copy.journal.cardTitle}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-lab" className="relative z-10 px-6 py-32 bg-foreground/[0.02]">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.ai.label}</span>
            <h2 className="mt-4 font-display text-4xl text-foreground sm:text-6xl">{copy.ai.title}</h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">{copy.ai.body}</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="liquid-glass flex flex-col rounded-[32px] p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5"><Radio className="w-5 h-5 text-muted-foreground" /></div>
                <div>
                  <h3 className="text-xl font-medium">{copy.ai.beatTitle}</h3>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">{copy.ai.beatMeta}</p>
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <div className="relative aspect-square w-full rounded-2xl bg-foreground/5 overflow-hidden flex items-center justify-center">
                  {isSearchingBeat ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground animate-pulse">{copy.ai.beatLoading}</p>
                    </div>
                  ) : selectedBeat ? (
                    <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.1),_transparent_58%),linear-gradient(160deg,rgba(19,27,44,0.98),rgba(8,10,18,0.92))] p-6">
                      <div className="flex items-start gap-4">
                        <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/10 shrink-0">
                          {selectedBeat.thumbnail ? (
                            <img src={selectedBeat.thumbnail} alt={copy.ai.beatPreviewAlt} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/60">{copy.ai.beatSourceLabel}</p>
                          <h4 className="mt-2 line-clamp-3 text-lg font-medium text-white">{selectedBeat.title}</h4>
                          <p className="mt-2 text-sm text-white/70">
                            {selectedBeat.artist}{selectedBeat.duration ? ` • ${selectedBeat.duration}` : ""}
                          </p>
                        </div>
                      </div>

                      {selectedBeat.previewUrl ? (
                        <div className="mt-6">
                          <audio
                            key={selectedBeat.id}
                            controls
                            src={selectedBeat.previewUrl}
                            className="w-full"
                            onPlay={() => setIsBeatPreviewPlaying(true)}
                            onPause={() => setIsBeatPreviewPlaying(false)}
                            onEnded={() => setIsBeatPreviewPlaying(false)}
                          />
                        </div>
                      ) : null}

                      <div className="mt-6 flex items-end justify-between gap-4">
                        <div className="flex gap-1">
                          {Array.from({ length: 18 }).map((_, index) => (
                            <span
                              key={index}
                              className={`block w-1 rounded-full bg-white/70 transition-all duration-300 ${isBeatPreviewPlaying ? "animate-pulse" : "opacity-40"}`}
                              style={{ height: `${18 + ((index * 11) % 48)}px`, animationDelay: `${index * 70}ms` }}
                            />
                          ))}
                        </div>
                        <p className="max-w-[9rem] text-right text-xs uppercase tracking-[0.2em] text-white/45">{copy.ai.beatPreviewHint}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center px-12"><p className="text-sm text-muted-foreground italic">{copy.ai.beatSample}</p></div>
                  )}
                </div>

                <div className="space-y-4">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    void handleSearchBeat();
                  }} className="flex gap-4 items-end">
                    <div className="flex-1">
                      <textarea rows={2} value={beatQuery} onChange={(e) => setBeatQuery(e.target.value)} placeholder={copy.ai.beatPlaceholder} className="w-full border-b border-foreground/10 bg-transparent py-2 text-foreground outline-none hover:border-foreground/40 hover:bg-foreground/[0.03] focus:border-foreground/60 transition-all duration-500 ease-out resize-none text-sm" />
                    </div>
                    <button type="submit" disabled={isSearchingBeat || !beatQuery.trim()} className="liquid-glass flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-4 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
                      {isSearchingBeat ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>
                  <div className="flex items-center justify-between gap-4">
                    <button type="button" onClick={() => void handleSearchBeat()} disabled={isSearchingBeat || !beatQuery.trim()} className="liquid-glass flex-1 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-medium text-foreground active:scale-[0.99] transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSearchingBeat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                      {copy.ai.beatButton}
                    </button>
                    {selectedBeat && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleCopyBeatLink(selectedBeat.url)}
                          className="liquid-glass flex h-11 items-center justify-center gap-2 rounded-full px-4 text-foreground transition-all"
                        >
                          {copiedBeatUrl === selectedBeat.url ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span className="text-xs font-medium">
                            {copiedBeatUrl === selectedBeat.url ? copy.ai.beatCopied : copy.ai.beatCopyButton}
                          </span>
                        </button>
                        <a href={selectedBeat.url} target="_blank" rel="noreferrer" className="liquid-glass flex h-11 items-center justify-center gap-2 rounded-full px-4 text-foreground transition-all">
                          <ExternalLink className="w-4 h-4" />
                          <span className="text-xs font-medium">{copy.ai.beatOpenButton}</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {beatError && !beatDiagnostic && (
                    <p className="text-sm text-red-400/80">{beatError}</p>
                  )}

                  {beatResults.length > 0 && (
                    <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                      {beatResults.map((beat) => (
                        <button
                          key={beat.id}
                          type="button"
                          onClick={() => {
                            setSelectedBeat(beat);
                            setIsBeatPreviewPlaying(false);
                          }}
                          className={`flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-all ${
                            selectedBeat?.id === beat.id ? "bg-foreground/10" : "hover:bg-foreground/5"
                          }`}
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-xl bg-foreground/5 shrink-0">
                            {beat.thumbnail && <img src={beat.thumbnail} alt={copy.ai.beatPreviewAlt} className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">{beat.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {beat.artist}{beat.duration ? ` • ${beat.duration}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!beatResults.length && !selectedBeat && !isSearchingBeat && !beatError && (
                    <p className="text-sm text-muted-foreground">{copy.ai.beatEmpty}</p>
                  )}

                  {beatDiagnostic && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-red-200/70">{copy.ai.beatDiagnosticTitle}</p>
                      {beatDiagnostic.status && (
                        <p className="mt-2 text-xs text-red-100/80">
                          {copy.ai.beatDiagnosticStatus}: {beatDiagnostic.status}
                        </p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                        {beatDiagnostic.message || copy.ai.beatDiagnosticUnknown}
                      </p>
                      <p className="mt-3 text-xs text-red-100/70">{copy.ai.beatDiagnosticHint}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="liquid-glass flex flex-col rounded-[32px] p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5"><Mic className="w-5 h-5 text-muted-foreground" /></div>
                <div>
                  <h3 className="text-xl font-medium">{copy.ai.lyricTitle}</h3>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">{copy.ai.lyricMeta}</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col space-y-6">
                <div className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto space-y-4 pr-2 scrollbar-hide" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {lyricMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-foreground/10 text-foreground" : "bg-foreground/5 text-muted-foreground"} whitespace-pre-wrap leading-relaxed`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isGeneratingLyric && (
                    <div className="flex justify-start">
                      <div className="bg-foreground/5 rounded-2xl px-4 py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleGenerateLyric} className="relative">
                  <input type="text" value={currentLyricInput} onChange={(e) => setCurrentLyricInput(e.target.value)} placeholder={copy.ai.lyricPlaceholder} className="w-full border-b border-foreground/10 bg-transparent py-3 pr-12 text-foreground outline-none hover:border-foreground/40 hover:bg-foreground/[0.03] focus:border-foreground/60 transition-all duration-500 ease-out text-sm" />
                  <button type="submit" disabled={isGeneratingLyric || !currentLyricInput.trim()} className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                {lyricDiagnostic && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-red-200/70">{copy.ai.lyricDiagnosticTitle}</p>
                    {lyricDiagnostic.status && (
                      <p className="mt-2 text-xs text-red-100/80">
                        {copy.ai.lyricDiagnosticStatus}: {lyricDiagnostic.status}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                      {lyricDiagnostic.message || copy.ai.lyricDiagnosticUnknown}
                    </p>
                    <p className="mt-3 text-xs text-red-100/70">{copy.ai.lyricDiagnosticHint}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="relative z-10 min-h-screen px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 md:grid-cols-2">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.contact.label}</span>
              <h2 className="mt-6 font-display text-5xl leading-tight text-foreground sm:text-7xl">
                {copy.contact.titleTop} <br />
                <em className="italic text-muted-foreground">{copy.contact.titleAccent}</em>
              </h2>
              <div className="mt-12 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="liquid-glass flex h-12 w-12 items-center justify-center rounded-full"><Mail className="w-5 h-5 text-muted-foreground" /></div>
                  <div><span className="block text-xs uppercase tracking-widest text-muted-foreground">{copy.contact.email}</span><span className="text-foreground">777thanhphong@gmail.com</span></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="liquid-glass flex h-12 w-12 items-center justify-center rounded-full"><MapPin className="w-5 h-5 text-muted-foreground" /></div>
                  <div><span className="block text-xs uppercase tracking-widest text-muted-foreground">{copy.contact.studio}</span><span className="text-foreground">Stockholm, SE</span></div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-8">
              <div className="liquid-glass w-full rounded-[32px] p-8">
                <form className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{copy.contact.name}</label>
                      <input type="text" className="w-full border-b border-foreground/10 bg-transparent py-2 text-foreground outline-none hover:border-foreground/40 hover:bg-foreground/[0.03] focus:border-foreground/60 transition-all duration-500 ease-out" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{copy.contact.emailField}</label>
                      <input type="email" className="w-full border-b border-foreground/10 bg-transparent py-2 text-foreground outline-none hover:border-foreground/40 hover:bg-foreground/[0.03] focus:border-foreground/60 transition-all duration-500 ease-out" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{copy.contact.message}</label>
                    <textarea rows={4} placeholder={copy.contact.projectPlaceholder} className="w-full border-b border-foreground/10 bg-transparent py-2 text-foreground outline-none hover:border-foreground/40 hover:bg-foreground/[0.03] focus:border-foreground/60 transition-all duration-500 ease-out resize-none" />
                  </div>
                  <button className="liquid-glass w-full rounded-full py-4 text-sm font-medium text-foreground active:scale-[0.99] transition-all duration-500 ease-out">{copy.contact.send}</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-foreground/5 px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
          <span className="font-display text-2xl text-foreground">Breeze Boy</span>
          <div className="flex gap-8">
            <a href="#" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Twitter</a>
            <a href="#" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Instagram</a>
            <a href="#" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Dribbble</a>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">{copy.footer.rights}</span>
        </div>
      </footer>
    </div>
  );
}
