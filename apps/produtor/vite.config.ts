import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localReact = path.resolve(__dirname, 'node_modules/react');
const rootReact = path.resolve(__dirname, '../../node_modules/react');
const reactDir = fs.existsSync(localReact) ? localReact : rootReact;
const localReactDom = path.resolve(__dirname, 'node_modules/react-dom');
const rootReactDom = path.resolve(__dirname, '../../node_modules/react-dom');
const reactDomDir = fs.existsSync(localReactDom) ? localReactDom : rootReactDom;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react/jsx-runtime': path.join(reactDir, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime.js'),
      react: reactDir,
      'react-dom': reactDomDir
    }
  },
  server: {
    host: true,
    port: 5174
  }
});
