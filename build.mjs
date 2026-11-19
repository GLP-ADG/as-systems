import * as esbuild from 'esbuild';
const opts = { entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['chrome89'], outfile: 'www/app.js', legalComments: 'none' };
if (process.argv.includes('--serve')) {
  const ctx = await esbuild.context(opts); await ctx.watch(); const { port } = await ctx.serve({ servedir: 'www', port: 8080 });
  console.log(`http://localhost:${port}`);
} else { await esbuild.build(opts); console.log('www/app.js listo'); }
