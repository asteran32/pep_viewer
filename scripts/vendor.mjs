import {copyFile, mkdir} from 'node:fs/promises';
await mkdir(new URL('../vendor/', import.meta.url), {recursive: true});
for (const [source, target] of [['dist/exceljs.min.js', 'exceljs.min.js'], ['LICENSE', 'exceljs.LICENSE']]) {
  await copyFile(new URL('../node_modules/exceljs/' + source, import.meta.url), new URL('../vendor/' + target, import.meta.url));
}
console.log('ExcelJS 4.4.0 browser bundle and MIT license copied to vendor/.');
