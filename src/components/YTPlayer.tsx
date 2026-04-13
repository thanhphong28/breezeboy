import React, { useEffect, useRef } from 'react';

type AnyFn = (...a: any[]) => any;

const loadYouTubeAPI = (() => {
  let promise: Promise<any> | null = null;
  return () => {
    if (promise) return promise;
    promise = new Promise((resolve, reject) => {
      if ((window as any).YT && (window as any).YT.Player) return resolve((window as any).YT);
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = (e) => reject(e);
      document.body.appendChild(tag);
      (window as any).onYouTubeIframeAPIReady = () => resolve((window as any).YT);
    });
    return promise;
  };
})();

interface Props {
  videoId: string;
  playing?: boolean;
  volume?: number; // 0..1
  muted?: boolean;
  width?: string | number;
  height?: string | number;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (e: any) => void;
  onInstance?: (inst: any | null) => void;
}

export default function YTPlayer({
  videoId,
  playing = false,
  volume = 1,
  muted = false,
  width = '100%',
  height = '100%',
  onReady,
  onPlay,
  onPause,
  onEnded,
  onError,
  onInstance,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    loadYouTubeAPI()
      .then((YT) => {
        if (!mounted) return;
        try {
          playerRef.current = new YT.Player(containerRef.current, {
            width: typeof width === 'number' ? String(width) : width,
            height: typeof height === 'number' ? String(height) : height,
            videoId,
            playerVars: {
              autoplay: 0,
              controls: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
            },
            events: {
              onReady: (e: any) => {
                onInstance?.(playerRef.current);
                try {
                  if (muted && typeof e.target.mute === 'function') e.target.mute();
                  else if (typeof e.target.unMute === 'function') e.target.unMute();
                  if (typeof e.target.setVolume === 'function') e.target.setVolume(Math.round(volume * 100));
                } catch (err) {}
                onReady?.();
              },
              onStateChange: (e: any) => {
                const state = YT.PlayerState;
                if (e.data === state.PLAYING) onPlay?.();
                if (e.data === state.PAUSED) onPause?.();
                if (e.data === state.ENDED) onEnded?.();
              },
              onError: (e: any) => onError?.(e),
            },
          });
        } catch (err) {
          onError?.(err);
        }
      })
      .catch((err) => onError?.(err));

    return () => {
      mounted = false;
      try {
        playerRef.current?.destroy?.();
      } catch (e) {}
      onInstance?.(null);
    };
  }, [videoId]);

  // Sync muted/volume
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (muted && typeof p.mute === 'function') p.mute();
      else if (typeof p.unMute === 'function') p.unMute();
      if (typeof p.setVolume === 'function') p.setVolume(Math.round((volume ?? 1) * 100));
    } catch (e) {}
  }, [muted, volume]);

  // Sync play/pause
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (playing && typeof p.playVideo === 'function') p.playVideo();
      else if (!playing && typeof p.pauseVideo === 'function') p.pauseVideo();
    } catch (e) {}
  }, [playing]);

  // If videoId changed while player exists, load it
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const curId = p.getVideoData?.()?.video_id;
      if (curId !== videoId && typeof p.loadVideoById === 'function') p.loadVideoById(videoId);
    } catch (e) {}
  }, [videoId]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
