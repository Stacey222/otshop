# Requirement traceability

Status: Phase 1 coverage review of the master specification

This table assigns every master-specification topic to an authoritative design document and delivery phase. Assignment is not a claim that later-phase functionality exists.

| Specification sections | Requirement area | Architecture home | Delivery phase |
| --- | --- | --- | --- |
| 1-5 | Authorized publishing vision, adapter separation, no invented API, Android strategy, human authentication | [System design](system-design.md), [Publisher contract](publisher-contract.md), [Security](security.md) | 2-10 by gated roadmap |
| 6-10 | Multi-user hierarchy, RBAC, core entities, accounts, devices | [Database](database.md), [Security](security.md) | 2 foundation; device operations 7 |
| 11-13 | Datasets, media validation, FFmpeg, normalization, immutable originals | [System design](system-design.md#media-and-storage-boundary), [Database](database.md), [Roadmap](../implementation-roadmap.md) | 3 |
| 14-16 | Projects, captions, product references/mapping | [Database](database.md), [Publisher contract](publisher-contract.md#product-attachment-rule) | 4 |
| 17-20 | Async mass jobs, priority fairness, device locks, heartbeat | [Job queue](job-queue.md), [Worker protocol](worker-protocol.md), [Database](database.md) | 5-6, concurrency hardened 11 |
| 21-24 | Screen Objects, selector strategy, UI change detection, upload stages | [System design](system-design.md#explicitly-deferred), [Worker protocol](worker-protocol.md), [Android observations](../research/android-workflow-observations.md) | 7-9 only after evidence |
| 25-28 | Idempotency, retry, circuit breaker, safe rate controls | [Job state machine](job-state-machine.md#idempotency), [Error taxonomy](error-taxonomy.md), [Database](database.md) | 5, expanded 11 |
| 29-31 | Scheduling, queue abstraction, events | [Scheduler](scheduler.md), [Job queue](job-queue.md), [Database](database.md) | 5 event foundation; 11 scheduler runtime |
| 32-35 | Real-time/main/project dashboards and bulk controls | [System design](system-design.md#request-and-event-flow), [Roadmap](../implementation-roadmap.md) | dashboard foundation 2; job UI 5; live/bulk later |
| 36-40 | Structured logging, audit, security, file safety, storage abstraction | [Security](security.md), [System design](system-design.md#observability) | 2 foundations; media completion 3 |
| 41 | Recommended technology stack | [System design](system-design.md) | 2 |
| 42-47 | Worker API/config/installer/Windows/network/one-device rule | [Worker protocol](worker-protocol.md), [System design](system-design.md#deployment-topology) | protocol 6; installer/device 7 |
| 48-51 | Project concurrency, failover, account-device binding/identity | [Worker protocol](worker-protocol.md#lease-model), [Database](database.md), [Error taxonomy](error-taxonomy.md) | 7 identity evidence; 11 concurrency |
| 52-54 | Pre-flight, dry run, deterministic mock mode | [Publisher contract](publisher-contract.md), [Job state machine](job-state-machine.md), [Phase 2 contract](phase-2-plan.md) | mock foundation 2; pre-flight 4; job mock 5; dry run 9 |
| 55-56 | Metrics, health/readiness, centralized errors | [System design](system-design.md#observability), [Error taxonomy](error-taxonomy.md) | 2 health/errors; metrics hardening 12 |
| 57-60 | Constraints, transactions, atomic claims, crash recovery | [Database](database.md), [Job queue](job-queue.md), [Job state machine](job-state-machine.md#crash-and-stale-lease-recovery) | 2 constraints; 5-6 execution |
| 61-65 | Operator UX, routes, onboarding, reports, CSV | [Phase 2 contract](phase-2-plan.md#required-initial-pages), [Roadmap](../implementation-roadmap.md) | shell 2; feature pages/reporting in later scoped slices |
| 66-68 | Test categories, critical cases, mock vs real device, real-publish false | [Phase 2 contract](phase-2-plan.md#required-test-groups), [Job queue](job-queue.md#required-tests), [Security](security.md#required-phase-2-security-tests) | continuous; real device 7+ |
| 69 | Conservative feature flags | [System design](system-design.md#feature-flags) | 2 |
| 70 | Sequential development phases | [Roadmap](../implementation-roadmap.md), [Phase 2 contract](phase-2-plan.md) | 0-12 |
| 71-75 | Code quality, strict TypeScript, typed Python, migrations, Git checks | [System design](system-design.md#module-dependency-rule), [Phase 2 contract](phase-2-plan.md) | begins 2, continuous |
| 76-82 | Documentation, configuration, performance, retention, diagnostics, compatibility, adapter versions | [System design](system-design.md), [Worker protocol](worker-protocol.md), [Security](security.md#safe-diagnostics), [Roadmap](../implementation-roadmap.md) | foundations 2; device 7-8; hardening 12 |
| 83-85 | Generic platform boundary, future bot/AI through application API | [System design](system-design.md#repository-topology-and-ownership), [Publisher contract](publisher-contract.md) | architecture now; implementations explicitly deferred |
| 86-87 | Large-batch confirmation and content ownership metadata | [Database](database.md), [Security](security.md) | metadata 3; confirmation 5 |
| 88-90 | Definition of done, incremental behavior, no hallucination | [Phase 2 contract](phase-2-plan.md#phase-2-definition-of-done), all architecture documents | continuous |
| 91-92 | Phase sequencing and desired end state | [Current state](current-state.md), [Roadmap](../implementation-roadmap.md), [System design](system-design.md) | entire program |

## Deferred requirements rule

A later-phase assignment is an explicit home, not permission to implement early. Shopee-specific external facts remain `TODO_REQUIRES_VERIFICATION` until backed by official documentation or authorized UI evidence. Phase 2 is constrained by [its implementation contract](phase-2-plan.md).
