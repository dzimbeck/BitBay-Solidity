// solc-worker-084.js
// This script runs in a Web Worker, not in the main browser thread.

// Import the specific soljson binary. Adjust path if necessary.
importScripts('./soljson084.js');

// Import the solc/wrapper (assuming it's available locally)
// If you don't have a local wrapper.js, you might need to try a CDN path for it
// or paste the wrapper content directly into this file.
// For example: importScripts('https://cdn.jsdelivr.net/npm/solc-js/wrapper.js');
importScripts('./wrapper.js'); // Assuming wrapper.js is in the same directory

let compiler; // This will hold the initialized compiler instance

self.addEventListener('message', (e) => {
    const { command, input, requestId } = e.data;

    if (command === 'init') {
        try {
            // self.Module is the Emscripten Module object created by soljson.js
            // solc_wrapper is the function exposed by wrapper.js (see its IIFE)
            if (typeof self.solc_wrapper === 'function' && self.Module) {
                 compiler = self.solc_wrapper(self.Module);
                 // Check if the compiler has the compile method
                 if (typeof compiler.compile === 'function') {
                    self.postMessage({ type: 'ready' });
                 } else {
                    throw new Error("Compiler wrapper did not expose a 'compile' method.");
                 }
            } else {
                throw new Error("solc_wrapper or Module not found after loading soljson.js and wrapper.js.");
            }
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    } else if (command === 'compile') {
        if (!compiler) {
            self.postMessage({ type: 'compilationError', requestId, error: 'Compiler not initialized in worker.' });
            return;
        }
        try {
            const output = compiler.compile(input);
            self.postMessage({ type: 'compilationResult', requestId, output });
        } catch (error) {
            self.postMessage({ type: 'compilationError', requestId, error: error.message });
        }
    }
});