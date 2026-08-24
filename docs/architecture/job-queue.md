# Job queue architecture

Status: authoritative Phase 1 queue design

Initial adapter: PostgreSQL; Redis is not required

## Responsibility boundary

`JobQueue` makes eligible publication jobs available, creates offers, and records delivery outcomes. It does not publish, select captions/products, calculate schedules, or authorize users. Application services own state transitions and transactions.

```ts
export interface JobQueue {
  enqueue(input: Readonly<{
    workspaceId: string;
    jobId: string;
    availableAt: string;
  }>): Promise<void>;

  claim(input: Readonly<{
    workerId: string;
    availableDeviceIds: ReadonlyArray<string>;
    supportedPublisherKinds: ReadonlyArray<string>;
    maxOffers: number;
  }>): Promise<ReadonlyArray<JobOffer>>;

  acknowledge(input: LeaseCommand): Promise<void>;
  fail(input: LeaseFailureCommand): Promise<void>;
  retry(input: RetryCommand): Promise<void>;
  pause(input: JobCommand): Promise<void>;
  cancel(input: JobCommand): Promise<void>;
}
```

The TypeScript implementation uses complete shared schemas; the abbreviated command names above refer to contracts in the application layer. Adapters may not expose backend-specific job objects to domain code.

## PostgreSQL adapter

`publish_jobs` is the queue table. A job is eligible when:

- status is `QUEUED`;
- `available_at <= database_now`;
- its project, workspace, and account are active;
- project/account rate and circuit policies allow execution;
- no offered/active job lease exists;
- the requesting worker belongs to the job workspace;
- a reported available device is compatible and unleased;
- the worker supports the publisher kind.

`enqueue` is idempotent because the job already exists and its status/availability are authoritative. It validates the job and emits an outbox wake-up event; it does not insert a second queue record.

## Atomic claim

Claim uses one PostgreSQL transaction at `READ COMMITTED` with row locks, partial unique indexes, and retry on serialization/unique conflict:

```text
BEGIN
  lock authenticated worker row
  choose least-recently-dispatched eligible workspace
  lock its workspace_dispatch_state row
  select highest-priority oldest eligible job
    FOR UPDATE SKIP LOCKED
  select one compatible unleased device
    FOR UPDATE SKIP LOCKED
  insert OFFERED job_lease
  insert OFFERED device_lease
  update workspace_dispatch_state
COMMIT
```

The raw lease token is generated before insertion; only its hash is persisted. Failure to insert either lease rolls back the whole offer. The job remains `QUEUED` until acknowledgement.

## Fair scheduling

Priority applies within a workspace; it does not let one workspace starve others.

1. Eligible workspaces are ordered by `workspace_dispatch_state.last_dispatched_at ASC NULLS FIRST`.
2. The chosen workspace state row is locked.
3. Within that workspace, jobs are ordered by priority rank `URGENT`, `HIGH`, `NORMAL`, `LOW`, then `available_at`, then `created_at`, then `id`.
4. A successful offer updates `last_dispatched_at` using database time and increments `dispatch_count`.
5. Workspace concurrency/account/device limits are eligibility predicates.

This provides least-recently-dispatched round-robin behavior across workspaces with deterministic ordering inside each workspace. Phase 11 may add weighted quotas; it must preserve the `JobQueue` port.

## Acknowledge, fail, retry, pause, cancel

- `acknowledge` validates offered lease ownership/deadline, activates both leases, creates an attempt, and transitions `QUEUED -> PREPARING` transactionally.
- `fail` records a typed error and asks the state machine for the next state; it never makes an independent retry decision.
- `retry` persists the selected backoff in `available_at` and transitions `RETRYING -> QUEUED` when due.
- `pause` prevents new offers and uses safe-point rules for active jobs.
- `cancel` immediately cancels only pre-upload states; active side effects use `cancel_requested_at`.

All commands are idempotent by operation/report ID and expected job version.

## Wake-up and polling

The MVP worker uses bounded long polling on the claim endpoint. PostgreSQL `LISTEN/NOTIFY` may wake a control-plane waiter after commit, but notifications are advisory and lossy; periodic polling remains the correctness mechanism. The outbox makes dashboard/event delivery recoverable.

Recommended initial values are configuration, not domain constants:

- claim long-poll maximum: 20 seconds;
- empty-queue backoff: 2 to 10 seconds, bounded;
- maximum offers per worker request: 1 through the one-device MVP;
- database query timeout: below the HTTP deadline.

## Recovery

The queue recovery loop handles:

- expired unacknowledged offers: expire leases; job stays queued;
- expired active leases: follow state-specific crash recovery;
- jobs in `RETRYING` whose `available_at` arrived: transition to queued under lock;
- queued jobs with inactive project/account: pause or fail according to policy;
- outbox rows not published: retry delivery without changing job state.

Every loop is safe with multiple replicas due to `FOR UPDATE SKIP LOCKED`, optimistic versions, and unique recovery IDs.

## Future Redis/BullMQ adapter

A future adapter may place job IDs in Redis for lower-latency wake-up and delayed delivery. PostgreSQL remains authoritative for state, idempotency, attempts, and leases. A Redis message carries only job/workspace IDs and version; the consumer revalidates eligibility in PostgreSQL before offering it.

Migration therefore changes infrastructure wiring and the queue adapter, not domain state, publisher contracts, or worker result semantics. Redis loss can delay work but cannot lose an accepted job or create a valid duplicate publication.

## Required tests

- two workers race for one job: exactly one offer;
- two workers race for one device: exactly one device lease;
- offer expires before acknowledgment: no attempt created;
- duplicate acknowledgment/report: one attempt/event;
- urgent jobs preserve cross-workspace fairness;
- inactive project/account is not claimed;
- retry becomes eligible only at persisted `available_at`;
- Redis absent: all MVP queue tests still pass;
- crash during upload follows unknown-state recovery, never requeue.
