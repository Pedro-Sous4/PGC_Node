export interface UploadJobResponse {
  request_id: string;
}

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'CANCELED';
