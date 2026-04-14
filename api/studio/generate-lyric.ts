import { getApiErrorDetails, getJsonBody, normalizeLyricText, readEnvVar } from "./helpers.js";

const GEMINI_API_KEY = readEnvVar("GEMINI_API_KEY");
const GEMINI_TEXT_MODEL = readEnvVar("GEMINI_TEXT_MODEL") || "gemini-2.5-flash";
const GEMINI_TEXT_FALLBACK_MODELS = [
  GEMINI_TEXT_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
];
const GEMINI_SYSTEM_INSTRUCTION =
  "You are a professional songwriter and lyricist. Always answer in the same language as the user's latest message. If the user writes in Vietnamese, answer in natural Vietnamese. Keep formatting clean and readable. Do not use markdown like **bold**, headings, or bullet-heavy formatting unless explicitly requested. Prefer short paragraphs or clearly separated lyric options with simple plain text.";

function toGeminiContents(history: any[], message: string) {
  return [...history, { role: "user", content: message }]
    .map((h) => {
      const text = String(h?.content || "").trim();
      if (!text) {
        return null;
      }

      return {
        role: h?.role === "user" ? "user" : "model",
        parts: [{ text }],
      };
    })
    .filter(Boolean);
}

async function callGeminiRest(model: string, contents: Array<{ role: string; parts: Array<{ text: string }> }>) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY!)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
        },
        contents,
      }),
    },
  );

  const rawText = await response.text();
  let data: any = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Gemini API request failed with status ${response.status}`;

    throw {
      status: response.status,
      message,
      details: data?.error?.details || data?.details,
      model,
    };
  }

  const text = data?.candidates
    ?.flatMap((candidate: any) => candidate?.content?.parts || [])
    ?.map((part: any) => part?.text)
    ?.filter((part: unknown) => typeof part === "string" && part.trim())
    ?.join("\n");

  return text;
}

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

    const contents = toGeminiContents(history, message);

    let lastError: unknown = null;

    for (const model of [...new Set(GEMINI_TEXT_FALLBACK_MODELS)]) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const text = await callGeminiRest(model, contents);
          return res.status(200).json({ text: normalizeLyricText(text) });
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
    console.error("generate-lyric error", {
      status:
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status?: unknown }).status === "number"
          ? (err as { status: number }).status
          : undefined,
      message:
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : err instanceof Error
            ? err.message
            : String(err),
      details:
        typeof err === "object" && err !== null && "details" in err
          ? (err as { details?: unknown }).details
          : undefined,
    });
    const details = getApiErrorDetails(err, "Lyric generation failed");
    return res.status(details.status).json({ error: details.message });
  }
}
