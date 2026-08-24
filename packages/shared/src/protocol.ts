import { z } from "zod";

export const WORKER_PROTOCOL_VERSION = 1 as const;
export const WorkerProtocolVersionSchema = z.literal(WORKER_PROTOCOL_VERSION);
export type WorkerProtocolVersion = z.infer<typeof WorkerProtocolVersionSchema>;
