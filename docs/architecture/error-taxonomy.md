# Error taxonomy

Status: authoritative Phase 1 classification

## Contract

Every operational error has a stable `code`, one default `category`, a safe operator message key, a `publishMayHaveOccurred` value, optional retry delay, correlation ID, and sanitized details. The state machine makes the final transition because stage and verified side-effect knowledge may make an otherwise retryable error uncertain.

Categories:

- `RETRYABLE`: transient and safe to repeat because publication is proven not to have been submitted;
- `NON_RETRYABLE`: configuration, authorization, or definitive platform/media failure that automatic retry cannot fix;
- `MANUAL_REVIEW_REQUIRED`: side effect may have happened or safe automated interpretation is unavailable.

Unknown errors default to `NON_RETRYABLE` before submission and `MANUAL_REVIEW_REQUIRED` after possible submission. Unknown never defaults to retryable.

## Canonical codes

| Code | Default category | Typical next state | Meaning |
| --- | --- | --- | --- |
| `DEVICE_NOT_FOUND` | `NON_RETRYABLE` | `FAILED` | Configured device record does not exist in the workspace |
| `DEVICE_OFFLINE` | `RETRYABLE` | `WAITING_FOR_DEVICE` or `RETRYING` | Registered device is temporarily unavailable before submission |
| `WORKER_OFFLINE` | `RETRYABLE` | `WAITING_FOR_DEVICE` or `RETRYING` | Assigned worker heartbeat expired before submission |
| `AUTH_REQUIRED` | `NON_RETRYABLE` | `WAITING_FOR_AUTH` | Legitimate user authentication/security interaction is required |
| `ACCOUNT_MISMATCH` | `NON_RETRYABLE` | `FAILED` | Visible/verified active account does not match expected account |
| `MEDIA_INVALID` | `NON_RETRYABLE` | `FAILED` | Media failed type, metadata, or profile validation |
| `MEDIA_NOT_FOUND` | `NON_RETRYABLE` | `FAILED` | Referenced storage object is absent |
| `DUPLICATE_JOB` | `NON_RETRYABLE` | existing state | Unique publication intent already exists; not a system failure |
| `UPLOAD_TIMEOUT` | contextual | `RETRYING` or `UNKNOWN_PUBLISH_STATE` | Timeout before submission is retryable; after possible submission needs review |
| `UI_SELECTOR_NOT_FOUND` | `MANUAL_REVIEW_REQUIRED` | `NEEDS_REVIEW` | Evidence-backed required UI element was not found; no coordinate guessing |
| `PLATFORM_REJECTED` | `NON_RETRYABLE` | `FAILED` | Platform definitively rejected submission |
| `NETWORK_ERROR` | contextual | `RETRYING` or `UNKNOWN_PUBLISH_STATE` | Retry only when submission is proven not to have occurred |
| `UNKNOWN_ERROR` | contextual | `FAILED` or `NEEDS_REVIEW` | Unclassified error; never automatically retry by default |
| `FEATURE_NOT_AVAILABLE` | `NON_RETRYABLE` | `FAILED` | Adapter or feature is disabled/unverified |
| `PUBLISHER_CAPABILITY_UNSUPPORTED` | `NON_RETRYABLE` | `FAILED` | Project requests a capability the adapter does not explicitly support |
| `SHOPEE_NOT_INSTALLED` | `NON_RETRYABLE` | `FAILED` | Future device check definitively found no app installation |
| `LEASE_NOT_ACTIVE` | `NON_RETRYABLE` | no transition | Stale, expired, or mismatched lease report was rejected |
| `WORKER_VERSION_UNSUPPORTED` | `NON_RETRYABLE` | no offer | Worker protocol/adapter version is outside supported range |
| `RATE_LIMITED` | `RETRYABLE` | `RETRYING` | Local safety policy or verified platform response requires cooldown |
| `CONFIGURATION_INVALID` | `NON_RETRYABLE` | `FAILED` | Required project/account/workspace configuration is invalid |
| `STORAGE_UNAVAILABLE` | `RETRYABLE` | `RETRYING` | Storage failed before any publisher side effect |
| `DIAGNOSTIC_REDACTION_FAILED` | `NON_RETRYABLE` | no upload | Diagnostic bundle cannot be proven sanitized |

`contextual` is resolved from the execution stage plus `publishMayHaveOccurred`; it is not left to string matching.

## Retry decision

```text
if category != RETRYABLE                         -> no automatic retry
if publishMayHaveOccurred                        -> UNKNOWN_PUBLISH_STATE
if attempt_count >= max_attempts                 -> FAILED
if circuit/account/workspace policy blocks work  -> PAUSED or RETRYING at cooldown
otherwise                                        -> RETRYING with persisted backoff
```

Adapters cannot set `publishMayHaveOccurred=false` after reaching their documented submission boundary unless they have definitive evidence of non-submission. A worker crash in `UPLOADING` overrides any generic worker-offline category and enters unknown state.

## Default backoff

The initial configurable sequence is 1, 5, 15, and 30 minutes. Jitter is bounded to prevent synchronized retries, generated once by the control plane, and persisted in `available_at`. A verified `retryAfterSeconds` may increase but never shorten local safety cooldown. Authentication waiting is not a timed automatic retry.

## Safe messages and diagnostics

External errors are mapped to operator message keys. Safe messages contain no stack traces, raw responses, captions, filenames, selectors, credentials, headers, cookies, tokens, OTP, or session material. Technical details use allowlisted fields and appear only in permission-protected diagnostics.

The raw caught exception may appear transiently in process memory for redaction and structured logging, but only the redacted representation leaves the boundary.

For HTTP requests the safe response uses the shared envelope and always includes the server-generated request ID. Known application errors map deterministically to an HTTP status, stable code, and safe message. Unknown errors map to `INTERNAL_ERROR`; their stack, exception message, Prisma/SQL details, filesystem paths, connection strings, and metadata are never serialized. Developers correlate the request ID with structured server logs instead of asking users for secret material.

## Extension rule

Adding a code requires:

1. unique stable name and owner module;
2. default category and stage overrides;
3. safe operator message;
4. state-machine mapping;
5. retry and `publishMayHaveOccurred` tests;
6. documentation update.

Adapters may use provider-specific internal subcodes in sanitized details, but public state logic depends only on centralized codes.
