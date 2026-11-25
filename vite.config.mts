import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')) as {version:string};
let commit='unavailable';
try {commit=execFileSync('git',['rev-parse','--short=12','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
catch {/* Packaging outside Git still works without a commit identifier. */}
const builtAt=new Date().toISOString();

export default defineConfig({
  base: '/',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageInfo.version),
    'import.meta.env.VITE_APP_GIT_COMMIT': JSON.stringify(commit),
    'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(builtAt),
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-test/**', '**/*.node.cjs'],
  },
});
