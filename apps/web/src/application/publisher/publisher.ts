import type {
  PublishRequest,
  PublishResult,
  PublishStatus,
  PublisherCapabilities,
  PublisherConnectionResult,
  PublisherKind,
} from "@otshop/shared";

export interface Publisher {
  readonly kind: PublisherKind;

  validateConnection(): Promise<PublisherConnectionResult>;
  getCapabilities(): Promise<PublisherCapabilities>;
  publish(request: PublishRequest): Promise<PublishResult>;
  checkStatus(
    input: Readonly<{
      accountId: string;
      deadlineAt: string;
      externalReference: string;
      jobId: string;
      requestId: string;
      workspaceId: string;
    }>,
  ): Promise<PublishStatus>;
  cancel(
    input: Readonly<{
      deadlineAt: string;
      externalReference: string;
      jobId: string;
      requestId: string;
      workspaceId: string;
    }>,
  ): Promise<Readonly<{ cancelled: boolean }>>;
}
