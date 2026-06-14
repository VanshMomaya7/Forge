import { createFixtureGraph, createFixtureTask } from './fixture.js';
import { integrationGate } from './gate.js';
import { integrate } from './integrate.js';
import { selectBest } from './select.js';

const graph = createFixtureGraph();
const task = createFixtureTask();
const selected = selectBest(graph);
task.selected = selected;

console.log('compose: selected');
for (const candidate of selected) {
  console.log(
    `- ${candidate.componentId}: ${candidate.variantId} overall=${candidate.score?.overall ?? 'n/a'}`
  );
}

const integration = await integrate(selected, graph, task);
console.log(`compose: assembled ${integration.artifactPath}`);

const gate = await integrationGate(integration.artifactPath, task);
console.log(`compose: gate passed=${gate.passed} overall=${gate.gate.overall}`);
console.log(gate.gate.notes);
