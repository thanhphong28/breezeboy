import { GoogleGenAI } from "@google/genai";
import { getApiErrorDetails, getJsonBody, parseDataUrl, readEnvVar } from "./helpers.js";

const GEMINI_API_KEY = readEnvVar("GEMINI_API_KEY");
const GEMINI_IMAGE_MODEL = readEnvVar("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  try {
    const body = await getJsonBody(req);
    const prompt = String(body.prompt || "").trim();
    const sourceImage = typeof body.sourceImage === "string" ? body.sourceImage : null;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: prompt },
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

    return res.status(200).json({
      image: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`,
    });
  } catch (err) {
    console.error("generate-image error", {
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
    });
    const details = getApiErrorDetails(err, "Image generation failed");
    return res.status(details.status).json({ error: details.message });
  }
}
