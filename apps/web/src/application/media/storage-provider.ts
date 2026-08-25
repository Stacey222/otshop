export interface StoredObjectStat {
  readonly sizeBytes: number;
}

export interface TemporaryStorageObject {
  readonly key: string;
}

export type StoragePromotion = "CREATED" | "EXISTS";

export interface StorageProvider {
  writeTemporary(source: AsyncIterable<Uint8Array>): Promise<TemporaryStorageObject>;
  promoteTemporary(temporaryKey: string, finalKey: string): Promise<StoragePromotion>;
  openRead(key: string): Promise<AsyncIterable<Uint8Array>>;
  stat(key: string): Promise<StoredObjectStat | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
