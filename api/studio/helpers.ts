function getStatusFromError(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const maybeObject = error as Record<string, unknown>;
  const statusFields = ["status", "statusCode", "code"] as const;

  for (const field of statusFields) {
    const value = maybeObject[field];
    if (typeof value === "number") {
      return value;
    }
  }

  if (typeof maybeObject.error === "object" && maybeObject.error !== null) {
    const nested = maybeObject.error as Record<string, unknown>;
    for (const field of statusFields) {
      const value = nested[field];
      if (typeof value === "number") {
        return value;
      }
    }
  }

  return undefined;
}

function getMessageFromError(error: unknown, fallbackMessage: string) {
  let message = fallbackMessage;

  if (typeof error === "string" && error.trim()) {
    message = error;
  } else if (error instanceof Error && error.message) {
    message = error.message;
  } else if (typeof error === "object" && error !== null) {
    const maybeObject = error as Record<string, unknown>;
    if (typeof maybeObject.message === "string" && maybeObject.message.trim()) {
      message = maybeObject.message;
    } else if (typeof maybeObject.error === "object" && maybeObject.error !== null) {
      const nested = maybeObject.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) {
        message = nested.message;
      }
    }
  }

  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === "object") {
        const parsedObject = parsed as Record<string, unknown>;
        if (typeof parsedObject.message === "string") {
          message = parsedObject.message;
        } else if (typeof parsedObject.error === "object" && parsedObject.error !== null) {
          const nested = parsedObject.error as Record<string, unknown>;
          if (typeof nested.message === "string") {
            message = nested.message;
          } else {
            message = JSON.stringify(parsedObject.error);
          }
        }
      }
    } catch {
      // keep original message if it is not JSON
    }
  }

  return message || fallbackMessage;
}

export function getApiErrorDetails(error: unknown, fallbackMessage: string) {
  const status = getStatusFromError(error) ?? 500;
  const rawMessage = getMessageFromError(error, fallbackMessage);

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

  if (status === 403) {
    return {
      status,
      message:
        "Authentication failed. Verify GEMINI_API_KEY and ensure the key is valid and enabled for the Gemini API.",
    };
  }

  if (status === 400) {
    return {
      status,
      message: rawMessage,
    };
  }

  return {
    status,
    message: rawMessage,
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
  const contentType = req.headers?.["content-type"] || req.headers?.["Content-Type"];
  try {
    if (req.body && typeof req.body === "object") {
      return req.body;
    }

    if (req.body && typeof req.body === "string") {
      return JSON.parse(req.body);
    }

    if (req.body && Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString("utf8"));
    }
  } catch (error) {
    console.error("getJsonBody parse error", {
      contentType,
      bodyType: typeof req.body,
      bodyValue: req.body && req.body.toString ? req.body.toString().slice(0, 120) : String(req.body),
      error: error instanceof Error ? error.message : error,
    });
    throw new Error("Invalid JSON");
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
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
