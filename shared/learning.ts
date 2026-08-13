export type LearningStatus = 'candidate' | 'verified';

export interface Learning {
  id: string;
  insight: string;
  sourceTaskId: string;
  sourceBranch: string;
  status: LearningStatus;
  verifiedBy?: string;
  tags: string[];
  createdAt: number;
}
