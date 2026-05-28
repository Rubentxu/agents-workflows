/// <reference types="vite/client" />

/**
 * Type declarations for Vite worker imports.
 *
 * `?worker` — imports a web worker as a constructor.
 *   import MyWorker from './worker.js?worker';
 *   const worker = new MyWorker();
 *
 * `?worker&url` — imports the worker as a URL string.
 *   import workerUrl from './worker.js?worker&url';
 *   const worker = new Worker(workerUrl);
 */
declare module '*?worker' {
  const workerConstructor: new (...args: ConstructorParameters<typeof Worker>) => Worker;
  export default workerConstructor;
}


