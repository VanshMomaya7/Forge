export function mountRenderer(canvas, modelUrl) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillRect(24, 24, 220, 120);
  ctx.fillText(`loaded ${modelUrl}`, 32, 170);

  return { modelUrl };
}
