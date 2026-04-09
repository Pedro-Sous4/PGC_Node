export type StageName =
  | 'UPLOAD_RECEIVED'
  | 'INGESTION'
  | 'MINIMO'
  | 'DESCONTOS'
  | 'CREDOR_LOOP'
  | 'ARTIFACTS'
  | 'FINISHED';

export type CredorState = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface CredorStatus {
  credorSlug: string;
  credorName?: string;
  state: CredorState;
  message?: string;
}

export interface JobState {
  requestId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'CANCELED';
  stage: StageName;
  percent: number;
  currentCredor?: string;
  successCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  errors: Array<{ credorSlug?: string; code: string; message: string }>;
  credores: CredorStatus[];
  artifacts: Array<{ type: 'CSV' | 'XLSX' | 'ZIP' | 'PDF'; path: string }>;
}
