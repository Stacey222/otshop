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

export class MediaNotReadyError extends SafeMediaError {
  constructor() {
    super("MEDIA_NOT_READY", "The media asset is not ready for thumbnail generation");
  }
}

export class ThumbnailGenerationInProgressError extends SafeMediaError {
  constructor() {
    super("THUMBNAIL_GENERATION_IN_PROGRESS", "A thumbnail is already being generated");
  }
}

export class ThumbnailGenerationTimeoutError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "THUMBNAIL_GENERATION_TIMEOUT",
      message: "Thumbnail generation timed out",
      retryable: true,
    });
  }
}

export class ThumbnailGenerationFailedError extends ApplicationError {
  constructor() {
    super({
      category: "NON_RETRYABLE",
      code: "THUMBNAIL_GENERATION_FAILED",
      message: "The thumbnail could not be generated safely",
      retryable: false,
    });
  }
}

export class ThumbnailStorageFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "THUMBNAIL_STORAGE_FAILURE",
      message: "The thumbnail could not be stored safely",
      retryable: true,
    });
  }
}

export class ThumbnailPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "THUMBNAIL_PERSISTENCE_FAILURE",
      message: "The thumbnail metadata could not be saved safely",
      retryable: true,
    });
  }
}
