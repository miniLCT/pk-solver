import { calculate } from './poker.js';
self.onmessage = ({ data }) => {
  try {
    const start = performance.now();
    const result = calculate(data, (done, total) => self.postMessage({ type: 'progress', done, total }));
    self.postMessage({ type: 'result', result: { ...result, elapsed: performance.now() - start } });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
