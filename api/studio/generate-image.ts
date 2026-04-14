import { GoogleGenAI } from "@google/genai";
import { getApiErrorDetails, getJsonBody, parseDataUrl, readEnvVar } from "./helpers.js";

const GEMINI_API_KEY = readEnvVar("GEMINI_API_KEY");
const GEMINI_IMAGE_MODEL = readEnvVar("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
const CLOUDFLARE_ACCOUNT_ID = readEnvVar("CLOUDFLARE_ACCOUNT_ID");
const CLOUDFLARE_API_TOKEN = readEnvVar("CLOUDFLARE_API_TOKEN");
const CLOUDFLARE_IMAGE_MODEL =
  readEnvVar("CLOUDFLARE_IMAGE_MODEL") || "@cf/black-forest-labs/flux-2-klein-4b";

async function generateWithCloudflare(prompt: string, sourceImage: string | null) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "1024");
  form.append("height", "1024");

  const source = parseDataUrl(sourceImage);
  if (source) {
    const buffer = Buffer.from(source.data, "base64");
    const blob = new Blob([buffer], { type: source.mimeType });
    form.append("input_image_0", blob, "reference-image");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
      body: form,
    },
  );

  const rawText = await response.text();
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

  if (!response.ok || !data?.success) {
    throw {
      status: response.status || 502,
      message,
      provider: "cloudflare",
    };
  }

  if (!data?.result?.image) {
    throw {
      status: 502,
      message: "No image generated",
      provider: "cloudflare",
    };
  }

  return `data:image/png;base64,${data.result.image}`;
}

async function generateWithGemini(prompt: string, sourceImage: string | null) {
  if (!GEMINI_API_KEY) {
    throw {
      status: 500,
      message: "Neither Cloudflare Workers AI nor Gemini image generation is configured on the server.",
      provider: "gemini",
    };
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
    throw {
      status: 502,
      message: "No image generated",
      provider: "gemini",
    };
  }

  return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await getJsonBody(req);
    const prompt = String(body.prompt || "").trim();
    const sourceImage = typeof body.sourceImage === "string" ? body.sourceImage : null;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const hasCloudflareConfig = Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);
    const image = hasCloudflareConfig
      ? await generateWithCloudflare(prompt, sourceImage)
      : await generateWithGemini(prompt, sourceImage);

    return res.status(200).json({ image });
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
      provider:
        typeof err === "object" && err !== null && "provider" in err
          ? (err as { provider?: unknown }).provider
          : undefined,
    });
    const details = getApiErrorDetails(err, "Image generation failed");
    return res.status(details.status).json({ error: details.message });
  }
}
