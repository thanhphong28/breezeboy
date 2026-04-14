import ytSearch from "yt-search";

const BEAT_KEYWORDS = [
  "beat",
  "type beat",
  "instrumental",
  "prod",
  "free for profit",
];

function looksLikeBeat(title: string) {
  const normalized = title.toLowerCase();
  return BEAT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = String(req.query?.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const searchQuery = `${query} type beat instrumental`;
    const r = await ytSearch(searchQuery);

    const videos = r.videos
      .filter((v) => looksLikeBeat(v.title))
      .slice(0, 12)
      .map((v) => ({
        id: v.videoId,
        title: v.title,
        artist: v.author.name,
        duration: v.timestamp,
        thumbnail: v.thumbnail,
        url: v.url,
      }));

    return res.status(200).json({ results: videos });
  } catch (error) {
    console.error("Beat search error:", error);
    return res.status(500).json({ error: "Failed to search beats" });
  }
}
