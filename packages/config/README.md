# Shared configuration

The single environment parsing and feature-flag boundary for the TypeScript control plane. It uses Zod because TypeScript types do not validate process input at runtime.

Media process configuration is server-owned and validated here. `FFPROBE_EXECUTABLE` defaults to `ffprobe`, `FFPROBE_TIMEOUT_MS` to 15,000, and `FFPROBE_MAX_OUTPUT_BYTES` to 262,144. Request data never overrides these values.
