import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { readBoundedJson } from "./json-body";

describe("readBoundedJson", () => {
  it("parses bounded JSON without trusting the declared length", async () => {
    const request = new NextRequest("http://localhost/api/datasets", {
      method: "POST",
      body: JSON.stringify({ name: "Dataset" }),
      headers: { "Content-Type": "application/json" },
    });
    await expect(readBoundedJson(request, 100)).resolves.toEqual({ name: "Dataset" });
  });

  it("rejects declared and streamed oversize payloads", async () => {
    const declared = new NextRequest("http://localhost/api/datasets", {
      method: "POST",
      body: "{}",
      headers: { "Content-Length": "101" },
    });
    await expect(readBoundedJson(declared, 100)).rejects.toBeInstanceOf(SyntaxError);

    const streamed = new NextRequest("http://localhost/api/datasets", {
      method: "POST",
      body: JSON.stringify({ description: "x".repeat(100) }),
    });
    await expect(readBoundedJson(streamed, 50)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects malformed JSON and encoded bodies", async () => {
    const malformed = new NextRequest("http://localhost/api/datasets", {
      method: "POST",
      body: "{",
    });
    await expect(readBoundedJson(malformed)).rejects.toBeInstanceOf(SyntaxError);
    const encoded = new NextRequest("http://localhost/api/datasets", {
      method: "POST",
      body: "{}",
      headers: { "Content-Encoding": "gzip" },
    });
    await expect(readBoundedJson(encoded)).rejects.toBeInstanceOf(SyntaxError);
  });
});
