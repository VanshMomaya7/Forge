import type { Step, ScoreResult } from './task.js';

export type BuildStrategy = 'assign' | 'race';
export type OrchestrationMode = 'race' | 'compose';
export interface InterfaceContract { produces?: string[]; consumes?: string[]; entry?: string; }
export interface ComponentSpec { id: string; goal: string; contract: InterfaceContract;
  strategy: BuildStrategy; variants?: number; }
export interface ComponentCandidate { componentId: string; variantId: string; worktree: string;
  steps: Step[]; score?: ScoreResult; artifactPath?: string; }
export interface ComponentGraph { components: ComponentSpec[]; candidates: ComponentCandidate[]; }
