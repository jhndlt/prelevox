import * as esbuild from 'esbuild';
const stub = (n, f) => ({ name: n, setup(b) { b.onResolve({ filter: f }, a => ({ path: new URL('./stubs/' + (n==='nowasm'?'nowasm':'empty') + '.js', import.meta.url).pathname })); } });
await esbuild.build({
  entryPoints: ['entry.js'], bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['safari15', 'chrome100'],
  outfile: 'out/monero-ts.js', legalComments: 'eof', inject: ['./shim.js'], define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  plugins: [stub('nowasm', /^#monero-ts\/monero\.js$/), stub('empty', /^(fs|path|http|https|child_process|web-worker|socks-proxy-agent|os|net|tls|crypto|url|stream|zlib)$/)],
  logLevel: 'warning'
});
