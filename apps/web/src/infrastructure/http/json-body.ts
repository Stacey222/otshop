import type { NextRequest } from "next/server";

const MAX_JSON_BODY_BYTES = 65_536;

export async function readBoundedJson(
  request: NextRequest,
  maximumBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const encoding = request.headers.get("content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") throw new SyntaxError();
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^[0-9]+$/u.test(declared) || Number(declared) > maximumBytes) throw new SyntaxError();
  }
  if (request.body === null) throw new SyntaxError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let observed = 0;
  let text = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      observed += next.value.byteLength;
      if (observed > maximumBytes) throw new SyntaxError();
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    throw new SyntaxError();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError();
  }
}
