import { searchBeatSources } from "./beats-source.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = String(req.query?.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const results = await searchBeatSources(query);
    return res.status(200).json({ results });
  } catch (error) {
    console.error("Beat search error:", error);
    return res.status(500).json({ error: "Failed to search beats" });
  }
}
