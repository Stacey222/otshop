# Shared configuration

The single environment parsing and feature-flag boundary for the TypeScript control plane. It uses Zod because TypeScript types do not validate process input at runtime.

Media process configuration is server-owned and validated here. FFprobe inspection defaults to a 15-second timeout and 262,144-byte output ceiling. FFmpeg thumbnail generation defaults to a 15-second timeout, a 262,144-byte diagnostic ceiling, a 1,048,576-byte JPEG ceiling, and a 640-pixel maximum dimension. Request data never overrides these values.
