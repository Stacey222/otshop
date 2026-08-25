import { ApplicationError } from "@/application/errors/application-error";

class SafeMediaError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class InvalidMediaError extends SafeMediaError {
  constructor() {
    super("INVALID_MEDIA", "The uploaded media is invalid");
  }
}

export class InvalidMediaFilenameError extends SafeMediaError {
  constructor() {
    super("INVALID_MEDIA_FILENAME", "The media filename is invalid");
  }
}

export class UnsupportedMediaTypeError extends SafeMediaError {
  constructor() {
    super("UNSUPPORTED_MEDIA_TYPE", "Only MP4 video uploads are supported");
  }
}

export class MediaTooLargeError extends SafeMediaError {
  constructor() {
    super("MEDIA_TOO_LARGE", "The media upload exceeds the configured size limit");
  }
}

export class MediaStorageFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "MEDIA_STORAGE_FAILURE",
      message: "The media could not be stored safely",
      retryable: true,
    });
  }
}

export class MediaPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "MEDIA_PERSISTENCE_FAILURE",
      message: "The media metadata could not be saved safely",
      retryable: true,
    });
  }
}

export class MediaNotFoundError extends SafeMediaError {
  constructor() {
    super("MEDIA_NOT_FOUND", "The media asset was not found");
  }
}

export class MediaInspectionInProgressError extends SafeMediaError {
  constructor() {
    super("MEDIA_INSPECTION_IN_PROGRESS", "The media asset is already being inspected");
  }
}

export class MediaUnsupportedError extends SafeMediaError {
  constructor() {
    super("MEDIA_UNSUPPORTED", "The media is not compatible with the MVP media policy");
  }
}

export class MediaInspectionTimeoutError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "MEDIA_INSPECTION_TIMEOUT",
      message: "Media inspection timed out",
      retryable: true,
    });
  }
}

export class MediaInspectionFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "MEDIA_INSPECTION_FAILED",
      message: "Media inspection could not be completed",
      retryable: true,
    });
  }
}
