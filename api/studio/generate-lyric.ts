import { GoogleGenAI } from "@google/genai";
import { getApiErrorDetails, getJsonBody, normalizeLyricText } from "./helpers.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GEMINI_TEXT_FALLBACK_MODELS = [
  GEMINI_TEXT_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  try {
    const body = await getJsonBody(req);
    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const normalizedHistory = history.map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.content || "") }],
    }));

    let lastError: unknown = null;

    for (const model of [...new Set(GEMINI_TEXT_FALLBACK_MODELS)]) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const chat = ai.chats.create({
            model,
            history: normalizedHistory,
            config: {
              systemInstruction:
                "You are a professional songwriter and lyricist. Always answer in the same language as the user's latest message. If the user writes in Vietnamese, answer in natural Vietnamese. Keep formatting clean and readable. Do not use markdown like **bold**, headings, or bullet-heavy formatting unless explicitly requested. Prefer short paragraphs or clearly separated lyric options with simple plain text.",
            },
          });

          const result = await chat.sendMessage({ message });
          return res.status(200).json({ text: normalizeLyricText(result.text) });
        } catch (error) {
          lastError = error;
          const status =
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            typeof (error as { status?: unknown }).status === "number"
              ? ((error as { status: number }).status)
              : 500;

          if (status === 503 && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }
    }

    const details = getApiErrorDetails(lastError, "Lyric generation failed");
    return res.status(details.status).json({ error: details.message });
  } catch (err) {
    console.error("generate-lyric error", err);
    const details = getApiErrorDetails(err, "Lyric generation failed");
    return res.status(details.status).json({ error: details.message });
  }
}
