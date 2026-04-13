import ytSearch from "yt-search";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = String(req.query?.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 20).map((v) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author.name,
      duration: v.timestamp,
      thumbnail: v.thumbnail,
      url: v.url,
    }));

    return res.status(200).json({ results: videos });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Failed to search music" });
  }
}
