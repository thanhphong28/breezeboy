import express from "express";
import { createServer as createViteServer } from "vite";
import ytSearch from "yt-search";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { searchBeatSources } from "./api/beats-source.js";

dotenv.config();

function normalizeEnvVar(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasWrappingDoubleQuotes =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;
  const hasWrappingSingleQuotes =
    trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;

  if (hasWrappingDoubleQuotes || hasWrappingSingleQuotes) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed;
}

function getApiErrorDetails(error: unknown, fallbackMessage: string) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status)
      : 500;

  const rawMessage =
    error instanceof Error && error.message
      ? error.message
      : fallbackMessage;

  if (status === 429) {
    return {
      status,
      message:
        "The current Google AI key has no available quota for this model right now. Check billing, quotas, or try again later.",
      };
  }

  if (status === 503) {
    return {
      status,
      message:
        "The current AI model is under high demand. Please try again in a moment.",
    };
  }

  if (status === 400) {
    return {
      status,
      message: rawMessage || fallbackMessage,
    };
  }

  return {
    status,
    message: rawMessage || fallbackMessage,
  };
}

function parseDataUrl(dataUrl?: string | null) {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return null;
  }

  const [meta, data] = dataUrl.split(",", 2);
  if (!meta || !data) {
    return null;
  }

  const mimeType = meta.split(":")[1]?.split(";")[0];
  if (!mimeType) {
    return null;
  }

  return { mimeType, data };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLyricText(text?: string) {
  if (!text) {
    return "No response";
  }

  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3001);
  const HMR_PORT = Number(process.env.HMR_PORT || 24678);

  app.use(express.json({ limit: "25mb" }));

  const GEMINI_API_KEY = normalizeEnvVar(process.env.GEMINI_API_KEY);
  const GEMINI_TEXT_MODEL =
    normalizeEnvVar(process.env.GEMINI_TEXT_MODEL) || "gemini-2.5-flash";
  const GEMINI_IMAGE_MODEL =
    normalizeEnvVar(process.env.GEMINI_IMAGE_MODEL) || "gemini-2.5-flash-image";
  const GEMINI_TEXT_FALLBACK_MODELS = [
    GEMINI_TEXT_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
  ];

  const CLOUDFLARE_ACCOUNT_ID = normalizeEnvVar(process.env.CLOUDFLARE_ACCOUNT_ID);
  const CLOUDFLARE_API_TOKEN = normalizeEnvVar(process.env.CLOUDFLARE_API_TOKEN);
  const CLOUDFLARE_IMAGE_MODEL =
    normalizeEnvVar(process.env.CLOUDFLARE_IMAGE_MODEL) ||
    "@cf/black-forest-labs/flux-2-klein-4b";

  console.log("Using Gemini API:", !!GEMINI_API_KEY);
  console.log("AI models:", {
    image: CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN ? CLOUDFLARE_IMAGE_MODEL : GEMINI_IMAGE_MODEL,
    text: GEMINI_TEXT_MODEL,
  });

  // AI Studio: image generation endpoint (server-side proxy)
  app.post("/api/studio/generate-image", async (req, res) => {
    try {
      const { prompt, sourceImage } = req.body as {
        prompt?: string;
        sourceImage?: string | null;
      };

      if (!prompt?.trim()) {
        return res.status(400).json({ error: "prompt is required" });
      }

      if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
        const form = new FormData();
        form.append("prompt", prompt.trim());
        form.append("width", "1024");
        form.append("height", "1024");

        const source = parseDataUrl(sourceImage);
        if (source) {
          const buffer = Buffer.from(source.data, "base64");
          const blob = new Blob([buffer], { type: source.mimeType });
          form.append("input_image_0", blob, "reference-image");
        }

        const cloudflareResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
            body: form,
          },
        );

        const rawText = await cloudflareResponse.text();
        let data: any = null;

        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          data = null;
        }

        const message =
          [
            ...(data?.errors?.map((item: any) => item?.message).filter(Boolean) || []),
            ...(data?.messages?.map((item: any) => item?.message).filter(Boolean) || []),
          ].join(" | ") ||
          data?.error ||
          rawText ||
          "Image generation failed";

        if (!cloudflareResponse.ok || !data?.success) {
          return res.status(cloudflareResponse.status || 502).json({
            error: message,
          });
        }

        if (!data?.result?.image) {
          return res.status(502).json({ error: "No image generated" });
        }

        return res.json({
          image: `data:image/png;base64,${data.result.image}`,
        });
      }

      if (!GEMINI_API_KEY) {
        return res
          .status(500)
          .json({
            error: "Neither Cloudflare Workers AI nor Gemini image generation is configured on server",
          });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
        { text: prompt.trim() },
      ];

      const source = parseDataUrl(sourceImage);
      if (source) {
        contents.push({
          inlineData: {
            mimeType: source.mimeType,
            data: source.data,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      const imagePart = response.candidates
        ?.flatMap((candidate: any) => candidate?.content?.parts || [])
        ?.find((part: any) => part?.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        return res.status(502).json({ error: "No image generated" });
      }

      return res.json({
        image: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`,
      });
    } catch (err) {
      console.error("generate-image error", err);
      const details = getApiErrorDetails(err, "Image generation failed");
      return res.status(details.status).json({ error: details.message });
    }
  });

  // AI Studio: lyric/chat generation endpoint (consolidated below)
  app.post("/api/studio/generate-lyric", async (req, res) => {
    try {
      const { message, history } = req.body as {
        message?: string;
        history?: { role: string; content: string }[];
      };

      if (!message?.trim()) {
        return res.status(400).json({ error: "message is required" });
      }

      if (!GEMINI_API_KEY) {
        return res
          .status(500)
          .json({ error: "GEMINI_API_KEY not configured on server" });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const normalizedHistory = (history || []).map((h) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.content }],
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

            const result = await chat.sendMessage({ message: message.trim() });
            return res.json({ text: normalizeLyricText(result.text) });
          } catch (error) {
            lastError = error;
            const status =
              typeof error === "object" &&
              error !== null &&
              "status" in error &&
              typeof (error as { status?: unknown }).status === "number"
                ? (error as { status: number }).status
                : 500;

            if (status === 503 && attempt < 2) {
              await delay(1200);
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
  });

  // API Route for YouTube Search
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const r = await ytSearch(query);
      // Filter to only videos (exclude playlists/channels)
      const videos = r.videos.slice(0, 20).map(v => ({
        id: v.videoId,
        title: v.title,
        artist: v.author.name,
        duration: v.timestamp,
        thumbnail: v.thumbnail,
        url: v.url
      }));

      res.json({ results: videos });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Failed to search music" });
    }
  });

  app.get("/api/beats", async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const results = await searchBeatSources(query);
      return res.json({ results });
    } catch (error) {
      console.error("Beat search error:", error);
      return res.status(500).json({ error: "Failed to search beats" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: HMR_PORT,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
