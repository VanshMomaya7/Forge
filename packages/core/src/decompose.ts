import type { ComponentGraph } from '@forge/shared/component';
import type { Task } from '@forge/shared/task';

export async function decompose(_task: Task): Promise<ComponentGraph> {
  void _task;

  return {
    components: [
      {
        id: 'renderer',
        goal: 'Build the 3D renderer entry point that mounts a model into a canvas.',
        contract: { entry: 'mountRenderer(canvas, modelUrl)' },
        strategy: 'assign'
      },
      {
        id: 'model',
        goal: 'Produce the 3D model asset used by the renderer and shell.',
        contract: { produces: ['dist/model.glb'] },
        strategy: 'race',
        variants: 2
      },
      {
        id: 'shell',
        goal: 'Build the website shell that loads the model and exposes the scene canvas.',
        contract: {
          consumes: ['model.glb'],
          entry: 'index.html with <canvas id="scene">'
        },
        strategy: 'assign'
      }
    ],
    candidates: []
  };
}
