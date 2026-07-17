import fs from 'fs';
import path from 'path';

// Mock browser globals
global.document = {
    addEventListener: () => {},
    getElementById: () => ({
        addEventListener: () => {}
    }),
    querySelectorAll: () => ({
        forEach: () => {}
    })
};
global.window = {};
// crypto is native in Node 20+
global.localStorage = {
    getItem: () => null,
    setItem: () => {}
};
global.indexedDB = {
    open: () => ({})
};

// Try to dynamically import the module
import('./public/js/main.js')
    .then(() => console.log('IMPORTS_SUCCESSFUL'))
    .catch(err => {
        console.error('IMPORTS_FAILED');
        console.error(err);
    });
