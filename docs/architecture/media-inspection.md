# Media inspection

Phase 3 Slice 3.2 inspects an already-ingested immutable object. It does not transform, transcode, thumbnail, publish, or delete the original.

## Boundary and flow

```text
AuthenticatedContext.workspaceId + mediaAssetId
  -> media.upload leaf authorization
  -> workspace-qualified MediaAsset lookup and inspection claim
  -> StorageProvider.openRead(opaque storage key)
  -> FFprobeMediaInspector stdin (pipe:0)
  -> bounded JSON parser and compatibility policy
  -> one atomic MediaAsset metadata/status update
```

`MediaInspector` is the application port. `FFprobeMediaInspector` is the process adapter. The adapter receives only a trusted storage stream: APIs cannot provide a path, URL, executable, argument, environment, or working directory. FFprobe is spawned with an argument array, `shell: false`, hidden Windows process UI, fixed structured-output arguments, and `pipe:0`. Raw stdout, stderr, commands, storage keys, and paths never enter API responses or logs.

## Configuration and resource limits

| Variable | Default | Valid range | Purpose |
| --- | ---: | ---: | --- |
| `FFPROBE_EXECUTABLE` | `ffprobe` | non-empty, at most 1,024 characters | Server-controlled executable name or path |
| `FFPROBE_TIMEOUT_MS` | `15000` | 1,000–120,000 ms | Hard process deadline |
| `FFPROBE_MAX_OUTPUT_BYTES` | `262144` | 4 KiB–4 MiB | Independent maximum for stdout and stderr |

Timeout, input-read failure, and spawn/system failure are transient. Timeout or output overflow terminates the child and waits for process closure. Non-zero exit, invalid/oversized output, malformed metadata, and incompatible media are permanent for the unchanged immutable object. This is process bounding, not a full OS sandbox: FFprobe CPU before timeout, native-library behavior, host memory outside captured output, and privileged local filesystem mutation remain operating-system/deployment concerns.

## Compatibility and normalization

`READY` means compatible with the current platform-neutral MVP pipeline policy, not verified Shopee compatibility:

- container reported as MP4/MOV by FFprobe (ingest still accepts only MP4);
- deterministic primary video: default-disposition video first, then lowest stream index;
- H.264 video using `yuv420p` or `yuvj420p`;
- optional primary audio, which must be AAC when present;
- positive duration no greater than 24 hours;
- width and height from 1 through 16,384;
- positive rational average frame rate no greater than 240 fps, normalized to three decimals;
- optional non-negative bitrate no greater than 1 Tb/s;
- rotation normalized to `ROTATION_0`, `ROTATION_90`, `ROTATION_180`, or `ROTATION_270`.

Subtitle/data streams and non-primary video/audio streams are ignored. The policy does not search lower-priority streams to make an otherwise incompatible primary stream pass. Pixel format and container participate in compatibility but have no existing `MediaAsset` columns, so they are not persisted. A null `audioCodec` means no primary audio stream.

## Persisted metadata and lifecycle

Successful inspection atomically writes `durationMs`, `width`, `height`, `fps`, `bitrateBps`, `codec`, `audioCodec`, `orientation`, clears `validationErrorCode`, increments `version`, and sets `READY`.

The minimal lifecycle is:

```text
INGESTED -> INSPECTING -> READY
                      -> REJECTED
                      -> INSPECTION_FAILED -> INSPECTING (retry)
```

`REJECTED` records a permanent bounded validation code and retains the original. `INSPECTION_FAILED` records a retryable system category and also retains the original. A READY or REJECTED immutable asset is idempotent and is not probed again. `INSPECTING` claims use the database `version`; simultaneous callers cannot both complete. A claim older than the larger of 60 seconds or twice the configured process timeout can be reclaimed after a crashed process. A late prior claimant cannot update after reclamation because completion requires its exact version.

## API and platform requirements

`POST /api/media/<mediaAssetId>/inspect` is same-origin, authenticated, active-workspace-scoped, protected by `media.upload`, correlated by request ID, and returned with `no-store`. Invalid or cross-workspace identifiers both return the same safe not-found response. Successful responses contain normalized metadata only.

Windows and Linux deployments must make a compatible `ffprobe` executable available on the service PATH or set the trusted `FFPROBE_EXECUTABLE`. Production code never invokes `ffmpeg`. Tests use `ffmpeg` only to create a tiny deterministic H.264 fixture, and CI explicitly installs and verifies the FFmpeg package before running tests.
