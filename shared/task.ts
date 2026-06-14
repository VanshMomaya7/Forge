import type { ComponentCandidate, ComponentGraph, OrchestrationMode } from './component.js';

export type TaskOrigin = 'human' | 'regression' | 'subtask';
export type Verdict = 'pass' | 'block' | 'redirect';
export type TaskVerdict = 'running' | 'won' | 'lost' | 'blocked' | 'shipped';
export interface ScoreResult { rubricPass: boolean; planAdherence: number;
  toolCorrectness: number; taskCompletion: number; overall: number; notes?: string; }
export interface Step { id: string; agentId: string; action: string; output: string;
  scores?: ScoreResult; verdict?: Verdict; ts: number; }
export interface Task { id: string; parentId?: string; origin: TaskOrigin;
  intent: string; context: Record<string, any>; mode: OrchestrationMode; plan?: string[]; steps: Step[];
  scores?: ScoreResult; verdict: TaskVerdict;
  graph?: ComponentGraph;
  selected?: ComponentCandidate[];
  integration?: { artifactPath?: string; gate?: ScoreResult; passed: boolean };
  artifact?: { diff?: string; deployUrl?: string };
  telemetry?: { p95Ms?: number; errorRate?: number };
  createdAt: number; updatedAt: number; }
