// solc-worker-070.js
// This script runs in a Web Worker, not in the main browser thread.

// Import the specific soljson binary. Adjust path if necessary.
importScripts('./soljson070.js');

// Import the solc/wrapper (assuming it's available locally)
importScripts('./wrapper.js'); // Assuming wrapper.js is in the same directory

let compiler; // This will hold the initialized compiler instance

self.addEventListener('message', (e) => {
    const { command, input, requestId } = e.data;

    if (command === 'init') {
        try {
            if (typeof self.solc_wrapper === 'function' && self.Module) {
                 compiler = self.solc_wrapper(self.Module);
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