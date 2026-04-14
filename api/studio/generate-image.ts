import { getApiErrorDetails, getJsonBody, parseDataUrl, readEnvVar } from "./helpers.js";

const CLOUDFLARE_ACCOUNT_ID = readEnvVar("CLOUDFLARE_ACCOUNT_ID");
const CLOUDFLARE_API_TOKEN = readEnvVar("CLOUDFLARE_API_TOKEN");
const CLOUDFLARE_IMAGE_MODEL =
  readEnvVar("CLOUDFLARE_IMAGE_MODEL") || "@cf/black-forest-labs/flux-2-klein-4b";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return res.status(500).json({
      error:
        "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server.",
    });
  }

  try {
    const body = await getJsonBody(req);
    const prompt = String(body.prompt || "").trim();
    const sourceImage = typeof body.sourceImage === "string" ? body.sourceImage : null;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

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

    const parsedData = data as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      messages?: Array<{ message?: string }>;
      result?: { image?: string };
    };

    if (!cloudflareResponse.ok || !parsedData?.success) {
      const message =
        [
          ...(parsedData?.errors?.map((item) => item.message).filter(Boolean) || []),
          ...(parsedData?.messages?.map((item) => item.message).filter(Boolean) || []),
        ].join(" | ") ||
        rawText ||
        "Image generation failed";

      return res.status(cloudflareResponse.status || 502).json({
        error: message,
      });
    }

    if (!parsedData?.result?.image) {
      return res.status(502).json({ error: "No image generated" });
    }

    return res.status(200).json({
      image: `data:image/png;base64,${parsedData.result.image}`,
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
