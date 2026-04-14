export type BeatSearchResult = {
  id: string;
  title: string;
  artist: string;
  duration?: string;
  thumbnail?: string;
  url: string;
  previewUrl?: string;
  source: "looperman";
};

function slugifyQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function matchFirst(content: string, pattern: RegExp) {
  const match = content.match(pattern);
  return match?.[1] ? decodeHtml(match[1].trim()) : undefined;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchLoopermanDetail(detailUrl: string) {
  const html = await fetchText(detailUrl);
  const title =
    matchFirst(html, /class="player-title[^"]*">([^<]+)</i) ||
    matchFirst(html, /<h1[^>]*>\s*Free\s+([^<]+)\s+\#\d+/i) ||
    "Untitled loop";
  const description =
    matchFirst(html, /<meta name="description" content="([^"]+)"/i) ||
    matchFirst(html, /<meta property="og:description" content="([^"]+)"/i) ||
    "";
  const artist = description.match(/\bby\s+([^.]+)\./i)?.[1]?.trim() || "Looperman";
  const bpm = description.match(/\bat\s+(\d+)\s*BPM\b/i)?.[1];
  const previewUrl = matchFirst(html, /data-mp3="([^"]+)"/i) || matchFirst(html, /<meta property="og:audio" content="([^"]+)"/i);
  const thumbnail = matchFirst(html, /<meta property="og:image" content="([^"]+)"/i);
  const canonical = matchFirst(html, /<link rel="canonical" href="([^"]+)"/i) || detailUrl;
  const id = canonical.match(/\/detail\/(\d+)/i)?.[1] || detailUrl;

  return {
    id,
    title,
    artist,
    duration: bpm ? `${bpm} BPM` : undefined,
    thumbnail,
    url: canonical,
    previewUrl,
    source: "looperman" as const,
  };
}

export async function searchBeatSources(query: string) {
  const slug = slugifyQuery(query);
  if (!slug) {
    return [] as BeatSearchResult[];
  }

  const listingUrl = `https://www.looperman.com/loops/tags/free-${slug}-loops-samples-sounds-wavs-download`;
  const listingHtml = await fetchText(listingUrl);
  const detailMatches = listingHtml.match(/\/loops\/detail\/[a-z0-9/-]+/gi) || [];
  const detailUrls = [...new Set(detailMatches)]
    .slice(0, 8)
    .map((path) => `https://www.looperman.com${path}`);

  const details = await Promise.all(
    detailUrls.map(async (url) => {
      try {
        return await fetchLoopermanDetail(url);
      } catch {
        return null;
      }
    }),
  );

  return details.filter((item): item is BeatSearchResult => Boolean(item && item.previewUrl));
}
