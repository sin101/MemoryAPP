import { parentPort, workerData } from 'worker_threads';
import { SimpleAI, HuggingFaceAI, TransformersAI, hasLocalModels } from './ai.js';

const { aiType, apiKey } = workerData || {};
let ai: any;
if (aiType === 'SimpleAI') {
  ai = new SimpleAI();
} else if (aiType === 'TransformersAI' || hasLocalModels()) {
  ai = new TransformersAI();
} else if (apiKey) {
  ai = new HuggingFaceAI({ apiKey });
} else {
  ai = new SimpleAI();
}

parentPort?.on('message', async ({ id, action, payload }) => {
  try {
    let result;
    switch (action) {
      case 'embed':
        result = await ai.embed(payload);
        break;
      case 'summarizeCard':
        result = await ai.summarizeCard(payload);
        break;
      case 'generateIllustration':
        result = await ai.generateIllustration(payload);
        break;
      default:
        result = null;
    }
    parentPort!.postMessage({ id, result });
  } catch (e: any) {
    parentPort!.postMessage({ id, error: e.message });
  }
});
