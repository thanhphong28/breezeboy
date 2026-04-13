export function getApiErrorDetails(error: unknown, fallbackMessage: string) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status)
      : 500;

  const rawMessage =
    error instanceof Error && error.message ? error.message : fallbackMessage;

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

export function parseDataUrl(dataUrl?: string | null) {
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

export function normalizeLyricText(text?: string) {
  if (!text) {
    return "No response";
  }

  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getJsonBody(req: any) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        return resolve({});
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
