// Concatenate vendor libs + minified brand-globe into a single dist/main.min.js.
// Vendor scripts are already minified; we only minify our own source.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

const vendor = [
    'vendor/topojson-client.min.js',
    'vendor/globe.gl.min.js',
    'vendor/countries-110m.js'
].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

async function build() {
    const ours = await esbuild.transform(
        fs.readFileSync(path.join(root, 'src/brand-globe.js'), 'utf8'),
        { minify: true, loader: 'js' }
    );
    fs.writeFileSync(path.join(out, 'main.min.js'), vendor + '\n' + ours.code);

    await esbuild.build({
        entryPoints: [path.join(root, 'src/main.css')],
        outfile: path.join(out, 'main.min.css'),
        minify: true
    });

    const bytes = fs.statSync(path.join(out, 'main.min.js')).size;
    console.log('  dist/main.min.js   ' + (bytes / 1024).toFixed(1) + ' kb');
    console.log('  dist/main.min.css  ' + (fs.statSync(path.join(out, 'main.min.css')).size / 1024).toFixed(1) + ' kb');
}

async function watch() {
    await build();
    fs.watch(path.join(root, 'src'), { recursive: true }, async () => {
        try { await build(); console.log('rebuilt'); }
        catch (e) { console.error(e.message); }
    });
    console.log('watching src/…');
}

(process.argv.includes('--watch') ? watch : build)();
