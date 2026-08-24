export interface AuthRequestMetadata {
  readonly ipPrefix?: string;
  readonly userAgentFamily?: string;
}

const bounded = (value: string | null, limit: number): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized === "" ? undefined : normalized.slice(0, limit);
};

interface HeaderReader {
  get(name: string): string | null;
}

export function requestMetadataFromHeaders(headers: HeaderReader): AuthRequestMetadata {
  const forwarded = bounded(headers.get("x-forwarded-for")?.split(",")[0] ?? null, 100);
  const ipPrefix = forwarded?.includes(":")
    ? `${forwarded.split(":").slice(0, 4).join(":")}::/64`
    : forwarded?.replace(/\.\d+$/u, ".0/24");
  const userAgentFamily = bounded(headers.get("user-agent"), 200);
  return {
    ...(ipPrefix === undefined ? {} : { ipPrefix }),
    ...(userAgentFamily === undefined ? {} : { userAgentFamily }),
  };
}

export function requestMetadata(request: Request): AuthRequestMetadata {
  return requestMetadataFromHeaders(request.headers);
}
