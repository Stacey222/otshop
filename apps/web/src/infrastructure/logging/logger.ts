import { getAppConfig, type LogLevel } from "@otshop/config";
import pino, { type DestinationStream, type Logger } from "pino";

import { sanitizeLogContext } from "./sanitize";

export interface ApplicationLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  withContext(context: Readonly<Record<string, unknown>>): ApplicationLogger;
}

class PinoApplicationLogger implements ApplicationLogger {
  constructor(private readonly destination: Logger) {}

  debug(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.destination.debug(sanitizeLogContext(context), message);
  }

  error(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.destination.error(sanitizeLogContext(context), message);
  }

  info(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.destination.info(sanitizeLogContext(context), message);
  }

  warn(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.destination.warn(sanitizeLogContext(context), message);
  }

  withContext(context: Readonly<Record<string, unknown>>): ApplicationLogger {
    return new PinoApplicationLogger(this.destination.child(sanitizeLogContext(context)));
  }
}

export const createApplicationLogger = (
  level: LogLevel,
  stream?: DestinationStream,
): ApplicationLogger => {
  const options = {
    base: { service: "control-plane" },
    level,
  } as const;
  const destination = stream === undefined ? pino(options) : pino(options, stream);

  return new PinoApplicationLogger(destination);
};

export const logger = createApplicationLogger(getAppConfig().logLevel);
