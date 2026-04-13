import { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { createPortal } from 'react-dom';
import { Play, Pause, Square, SkipForward, Volume2, VolumeX, Music, Search, Loader2, ListMusic, ArrowRight, Radio, Eye, EyeOff } from 'lucide-react';
import YTPlayer from './YTPlayer';

interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  thumbnail?: string;
}

const DEFAULT_TRACKS: Track[] = [
  { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio - Beats to Relax/Study to', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', artist: 'Lofi Girl' },
  { id: '4xDzrJKXOOY', title: 'Synthwave Radio - Beats to Chill/Game to', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY', artist: 'Lofi Girl' },
  { id: '1ZYbU82GVz4', title: 'Deep Focus Ambient Radio', url: 'https://www.youtube.com/watch?v=1ZYbU82GVz4', artist: 'Quiet Quest' },
  { id: 'xnnXlH5kKME', title: 'Space Ambient Music Live', url: 'https://www.youtube.com/watch?v=xnnXlH5kKME', artist: 'SpaceVideos' }
];

type Language = 'en' | 'vi';

const MUSIC_COPY: Record<Language, Record<string, string>> = {
  en: {
    sectionLabel: 'The Sound',
    title: 'Breeze Boy Music',
    description: 'Curated frequencies for deep focus. Search and play directly from YouTube Music.',
    nowPlaying: 'Now Playing',
    showVideo: 'Show video',
    hideVideo: 'Hide video',
    cover: 'Cover',
    video: 'Video',
    previousTrack: 'Previous Track',
    pause: 'Pause',
    play: 'Play',
    stop: 'Stop',
    nextTrack: 'Next Track',
    searchPlaceholder: 'Search YouTube Music...',
  },
  vi: {
    sectionLabel: 'Am Thanh',
    title: 'Nhac Breeze Boy',
    description: 'Nhung tan so duoc chon cho su tap trung sau. Tim va phat truc tiep tu YouTube Music.',
    nowPlaying: 'Dang Phat',
    showVideo: 'Hien video',
    hideVideo: 'An video',
    cover: 'Anh bia',
    video: 'Video',
    previousTrack: 'Bai truoc',
    pause: 'Tam dung',
    play: 'Phat',
    stop: 'Dung',
    nextTrack: 'Bai tiep',
    searchPlaceholder: 'Tim tren YouTube Music...',
  },
};

interface MusicPlayerProps {
  language: Language;
}

export default function MusicPlayer({ language }: MusicPlayerProps) {
  const copy = MUSIC_COPY[language];
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const [playlist, setPlaylist] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [displayMode, setDisplayMode] = useState<'video' | 'cover'>('video');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bars, setBars] = useState<number[]>([20, 30, 25, 18, 28]);
  const [showFloatingBar, setShowFloatingBar] = useState(false);

  const playerRef = useRef<any>(null);
  const ytPlayerRef = useRef<any>(null);
  const hideBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const track = playlist[currentTrackIndex];
  const markPlayerActivity = (keepVisible = true) => {
    if (hideBarTimerRef.current) {
      clearTimeout(hideBarTimerRef.current);
      hideBarTimerRef.current = null;
    }
    if (keepVisible) {
      setShowFloatingBar(true);
    }
  };
  const unmuteInternalPlayer = () => {
    try {
      const inst = playerRef.current?.getInternalPlayer?.();
      if (inst) {
        if (typeof inst.unMute === 'function') inst.unMute();
        if (typeof inst.setVolume === 'function') inst.setVolume(Math.round(volume * 100));
        return;
      }

      // Fallback to direct YT iframe API instance
      const ytp = ytPlayerRef.current;
      if (ytp) {
        if (typeof ytp.unMute === 'function') ytp.unMute();
        if (typeof ytp.unmute === 'function') ytp.unmute();
        if (typeof ytp.setVolume === 'function') ytp.setVolume(Math.round(volume * 100));
      }
    } catch (e) {
      console.warn('Could not access internal player to unmute', e);
    }
  };

  const nextTrack = () => {
    markPlayerActivity();
    setCurrentTrackIndex((prev) => (prev + 1) % playlist.length);
    setIsPlaying(true);
  };

  const playTrack = (index: number, newPlaylist?: Track[]) => {
    markPlayerActivity();
    if (newPlaylist) {
      setPlaylist(newPlaylist);
    }
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (isPlaying) {
      markPlayerActivity();
      setIsMuted(false);
      // try to unmute the internal player when playback starts
      setTimeout(() => unmuteInternalPlayer(), 200);
    }
  }, [isPlaying, currentTrackIndex]);

  useEffect(() => {
    if (hideBarTimerRef.current) {
      clearTimeout(hideBarTimerRef.current);
      hideBarTimerRef.current = null;
    }

    if (isPlaying) {
      setShowFloatingBar(true);
      return;
    }

    if (!showFloatingBar) {
      return;
    }

    hideBarTimerRef.current = setTimeout(() => {
      setShowFloatingBar(false);
    }, 5 * 60 * 1000);

    return () => {
      if (hideBarTimerRef.current) {
        clearTimeout(hideBarTimerRef.current);
        hideBarTimerRef.current = null;
      }
    };
  }, [isPlaying, showFloatingBar, currentTrackIndex]);

  // Poll for internal player instance when player is ready or playback starts.
  useEffect(() => {
    let attempts = 0;
    let timer: any = null;

    const pollInternal = () => {
      try {
        const inst = playerRef.current?.getInternalPlayer?.();
        if (inst) {
          try {
            if (typeof inst.unMute === 'function') inst.unMute();
            if (typeof inst.setVolume === 'function') inst.setVolume(Math.round(volume * 100));
          } catch (e) {
            console.warn('Error calling internal player methods', e);
          }
          return;
        }

        attempts++;
        if (attempts < 12) {
          timer = setTimeout(pollInternal, 300);
        } else {
          console.warn('internal player not available after retries');
        }
      } catch (err) {
        console.error('pollInternal error', err);
      }
    };

    if (isReady || isPlaying) pollInternal();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isReady, isPlaying, currentTrackIndex, volume]);

  // Sync playback time, duration and simple visualizer bars
  const getPlayerCurrentTime = () => {
    try {
      if (playerRef.current?.getCurrentTime) return playerRef.current.getCurrentTime();
      if (ytPlayerRef.current?.getCurrentTime) return ytPlayerRef.current.getCurrentTime();
    } catch (e) {}
    return 0;
  };

  const getPlayerDuration = () => {
    try {
      if (playerRef.current?.getDuration) return playerRef.current.getDuration();
      if (ytPlayerRef.current?.getDuration) return ytPlayerRef.current.getDuration();
    } catch (e) {}
    return 0;
  };

  useEffect(() => {
    let timer: any = null;
    const tick = () => {
      const t = getPlayerCurrentTime() || 0;
      const d = getPlayerDuration() || 0;
      setCurrentTime(t);
      setDuration(d);

      // update bars (visualizer) randomly when playing
      setBars((prev) => prev.map(() => (isPlaying ? Math.max(6, Math.round(Math.random() * 90 * (volume || 0.5) + 6)) : Math.max(2, Math.round(Math.random() * 8 + 2)))));
    };

    if (isReady || isPlaying) {
      tick();
      timer = setInterval(tick, 400);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isReady, isPlaying, currentTrackIndex, volume]);

  const seekTo = (seconds: number) => {
    markPlayerActivity();
    try {
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(seconds, 'seconds');
      } else if (ytPlayerRef.current?.seekTo) {
        ytPlayerRef.current.seekTo(seconds, true);
      }
    } catch (e) {
      console.warn('seek error', e);
    }
    setCurrentTime(seconds);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    const mm = Math.floor((s / 60) % 60);
    const hh = Math.floor(s / 3600);
    if (hh > 0) return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    return `${mm}:${ss}`;
  };

  const handleStop = () => {
    markPlayerActivity();
    setIsPlaying(false);
    if (playerRef.current) {
      playerRef.current.seekTo(0);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery + ' audio')}`);
      const data = await res.json();
      if (data.results) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Prevent hydration mismatch or SSR issues
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.thumbnail
          ? [{ src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : undefined,
      });
      navigator.mediaSession.setActionHandler('play', () => {
        markPlayerActivity();
        setIsPlaying(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        markPlayerActivity();
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        playTrack((currentTrackIndex - 1 + playlist.length) % playlist.length);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextTrack();
      });
    } catch (err) {
      console.warn('media session setup failed', err);
    }
  }, [track, currentTrackIndex, playlist.length]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && isPlaying) {
        markPlayerActivity();
        unmuteInternalPlayer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isPlaying, volume]);

  const Player = ReactPlayer as any;

  // displayMode toggles whether the visual shows the video iframe or only the cover image

  return (
    <section id="music" className="relative z-10 px-6 py-32 bg-foreground/[0.02]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16">
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{copy.sectionLabel}</span>
          <h2 className="mt-4 font-display text-4xl text-foreground sm:text-6xl">{copy.title}</h2>
          <p className="mt-6 max-w-2xl text-muted-foreground">
            {copy.description}
          </p>
        </div>

        <div className="liquid-glass relative w-full rounded-[40px] p-8 md:p-12 flex flex-col md:flex-row gap-12 overflow-hidden">
          {/* Left Panel: Player Controls */}
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-8">
                <ListMusic className="w-5 h-5 text-foreground" />
                <span className="text-sm font-medium uppercase tracking-widest text-foreground">{copy.nowPlaying}</span>
              </div>
              
              <div className="mb-8 flex flex-col items-center">
                <div className="flex items-start justify-center gap-4">
                  <div className="aspect-video w-full max-w-[400px] rounded-2xl overflow-hidden bg-black relative shadow-2xl">
                    {((track.url && track.url.includes('youtube.com')) || (track.url && track.url.includes('youtu.be')) || Boolean(track.id)) ? (
                      <YTPlayer
                        videoId={track.id}
                        playing={isPlaying}
                        volume={isMuted ? 0 : volume}
                        muted={isMuted}
                        onEnded={nextTrack}
                        onReady={() => {
                          markPlayerActivity();
                          setIsReady(true);
                          unmuteInternalPlayer();
                        }}
                        onPlay={() => {
                          markPlayerActivity();
                          setIsPlaying(true);
                          setIsMuted(false);
                          unmuteInternalPlayer();
                        }}
                        onPause={() => {
                          markPlayerActivity();
                          setIsPlaying(false);
                        }}
                        onError={(e: any) => console.error('YTPlayer error:', e)}
                        onInstance={(inst: any) => {
                          ytPlayerRef.current = inst;
                        }}
                      />
                    ) : (
                      <Player
                        ref={playerRef}
                        url={track.url}
                        playing={isPlaying}
                        volume={volume}
                        muted={isMuted}
                        controls={true}
                        onEnded={nextTrack}
                        onReady={() => {
                          markPlayerActivity();
                          setIsReady(true);
                          unmuteInternalPlayer();
                        }}
                        onPlay={() => {
                          markPlayerActivity();
                          setIsPlaying(true);
                          setIsMuted(false);
                          unmuteInternalPlayer();
                        }}
                        onPause={() => {
                          markPlayerActivity();
                          setIsPlaying(false);
                        }}
                        onError={(e: any) => {
                          console.error('ReactPlayer error:', e);
                        }}
                        width="100%"
                        height="100%"
                        config={{
                          youtube: {
                            playerVars: { 
                              modestbranding: 1,
                              playsinline: 1,
                              origin: typeof window !== 'undefined' ? window.location.origin : '' 
                            } as any
                          }
                        }}
                      />
                    )}

                    {displayMode === 'cover' && (
                      <div className="absolute inset-0 pointer-events-none">
                        <img
                          src={track.thumbnail ?? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex items-end gap-2 opacity-90">
                            {bars.map((h, i) => (
                              <div
                                key={i}
                                style={{ height: `${h}%`, width: 6 }}
                                className="bg-foreground rounded-sm transition-all duration-300"
                              />
                            ))}
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                    )}
                  </div>

                  {/* Side controls: eye (hide/show video) and PiP, placed outside the video frame */}
                  <div className="flex flex-col gap-2 items-center justify-start">
                    <button
                      onClick={() => setDisplayMode((d) => (d === 'cover' ? 'video' : 'cover'))}
                      title={displayMode === 'cover' ? copy.showVideo : copy.hideVideo}
                      className="p-2 rounded-full bg-background/60 border border-foreground/10 text-foreground hover:brightness-105 backdrop-blur"
                    >
                      {displayMode === 'cover' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-center mt-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setDisplayMode('cover')}
                      className={`text-xs px-3 py-1 rounded-full border border-foreground/10 transition-colors ${displayMode === 'cover' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {copy.cover}
                    </button>
                    <button
                      onClick={() => setDisplayMode('video')}
                      className={`text-xs px-3 py-1 rounded-full border border-foreground/10 transition-colors ${displayMode === 'video' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {copy.video}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-center px-4">
                <h3 className="text-xl font-medium text-foreground line-clamp-2">{track.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{track.artist}</p>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => playTrack((currentTrackIndex - 1 + playlist.length) % playlist.length)} 
                  className="text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95"
                  title={copy.previousTrack}
                >
                  <SkipForward className="w-6 h-6 rotate-180" />
                </button>
                
                <button 
                  onClick={() => setIsPlaying(!isPlaying)} 
                  className="liquid-glass flex h-16 w-16 items-center justify-center rounded-full text-foreground hover:scale-105 active:scale-95 transition-all"
                  title={isPlaying ? copy.pause : copy.play}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                </button>

                <button 
                  onClick={handleStop} 
                  className="text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95 flex h-12 w-12 items-center justify-center rounded-full"
                  title={copy.stop}
                >
                  <Square className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={nextTrack} 
                  className="text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95"
                  title={copy.nextTrack}
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex items-center justify-center gap-3 max-w-[200px] mx-auto">
                <button onClick={() => setIsMuted(!isMuted)} className="text-muted-foreground hover:text-foreground transition-all">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    markPlayerActivity();
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-full h-1 bg-foreground/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Search & Playlist */}
          <div className="flex-1 flex flex-col border-t md:border-t-0 md:border-l border-foreground/10 pt-8 md:pt-0 md:pl-12">
            <form onSubmit={handleSearch} className="relative mb-6">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-full py-3 pl-12 pr-4 text-sm text-foreground outline-none focus:border-foreground/30 transition-all"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <button 
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 playlist-scroll max-h-[400px]">
                  {searchResults.length > 0 ? (
                <>
                  {searchResults.map((t, i) => (
                    <div 
                      key={t.id}
                      onClick={() => playTrack(i, searchResults)}
                      className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all ${
                        playlist === searchResults && currentTrackIndex === i 
                          ? 'bg-foreground/10' 
                          : 'hover:bg-foreground/5'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-foreground/10 shrink-0">
                        {t.thumbnail && <img src={t.thumbnail} alt={t.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium line-clamp-1 ${playlist === searchResults && currentTrackIndex === i ? 'text-foreground' : 'text-foreground/80'}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.artist}</p>
                      </div>
                      {playlist === searchResults && currentTrackIndex === i && isPlaying && (
                        <div className="flex gap-0.5 items-end h-3 shrink-0">
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_1s_infinite] h-full"></div>
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_1.2s_infinite] h-2/3"></div>
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_0.8s_infinite] h-4/5"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {DEFAULT_TRACKS.map((t, i) => (
                    <div 
                      key={t.id}
                      onClick={() => playTrack(i, DEFAULT_TRACKS)}
                      className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all ${
                        playlist === DEFAULT_TRACKS && currentTrackIndex === i 
                          ? 'bg-foreground/10' 
                          : 'hover:bg-foreground/5'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-foreground/5 shrink-0">
                        <Radio className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium line-clamp-1 ${playlist === DEFAULT_TRACKS && currentTrackIndex === i ? 'text-foreground' : 'text-foreground/80'}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.artist}</p>
                      </div>
                      {playlist === DEFAULT_TRACKS && currentTrackIndex === i && isPlaying && (
                        <div className="flex gap-0.5 items-end h-3 shrink-0">
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_1s_infinite] h-full"></div>
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_1.2s_infinite] h-2/3"></div>
                          <div className="w-0.5 bg-foreground rounded-full animate-[bounce_0.8s_infinite] h-4/5"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
        {/* bottom bar is rendered into document.body via portal to avoid stacking issues */}
      {mounted && showFloatingBar && createPortal(
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[99999] pointer-events-auto w-full px-4">
          <div className="w-full max-w-3xl mx-auto">
            <div className="w-full bg-background/95 backdrop-blur-md border border-foreground/10 shadow-2xl rounded-[28px] sm:rounded-full py-3 px-4 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:min-w-[220px]">
                <img src={track.thumbnail ?? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`} alt={track.title} className="w-12 h-12 rounded-md object-cover" />
                <div className="flex min-w-0 flex-col text-sm">
                  <span className="font-medium text-foreground line-clamp-1">{track.title}</span>
                  <span className="text-xs text-muted-foreground line-clamp-1">{track.artist}</span>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => playTrack((currentTrackIndex - 1 + playlist.length) % playlist.length)} className="text-muted-foreground hover:text-foreground">
                    <SkipForward className="w-5 h-5 rotate-180" />
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => {
                        markPlayerActivity();
                        setIsPlaying(!isPlaying);
                      }}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-2xl transform transition-all hover:scale-105 active:scale-95 bg-gradient-to-br from-indigo-600 to-violet-500"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    {isPlaying && (
                      <span className="absolute inset-0 z-0 rounded-full bg-indigo-600/25 animate-ping" />
                    )}
                  </div>

                  <button onClick={nextTrack} className="text-muted-foreground hover:text-foreground">
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 text-[11px] text-muted-foreground">{formatTime(currentTime)}</div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(e) => {
                      markPlayerActivity();
                      setCurrentTime(parseFloat(e.currentTarget.value));
                    }}
                    onMouseUp={(e) => seekTo(parseFloat((e.target as HTMLInputElement).value))}
                    onPointerUp={(e) => seekTo(parseFloat((e.target as HTMLInputElement).value))}
                    className="w-full min-w-0 h-1 bg-foreground/10 rounded-full appearance-none"
                  />
                  <div className="shrink-0 text-[11px] text-muted-foreground">{formatTime(duration)}</div>
                </div>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto sm:min-w-[120px]">
                <button onClick={() => {
                  markPlayerActivity();
                  setIsMuted(!isMuted);
                }} className="text-muted-foreground hover:text-foreground shrink-0">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    markPlayerActivity();
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="h-1 w-full sm:w-24 bg-foreground/10 rounded-full appearance-none"
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      </section>
  );
}
