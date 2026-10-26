// Author the downloadable workbook with the managed Artifact Tool runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values: args} = parseArgs({options: {site: {type: 'string'}, 'output-dir': {type: 'string'}}});
const outputDir = args['output-dir'];
if (!args.site || !outputDir) throw new Error('Provide --site and --output-dir.');
await fs.mkdir(outputDir, {recursive: true});
const modules = process.env.ARTIFACT_TOOL_NODE_MODULES || path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
await fs.access(path.join(modules, '@oai/artifact-tool/package.json'));
const localModules = path.join(outputDir, 'node_modules');
try { await fs.symlink(modules, localModules, 'dir'); }
catch (error) {
  if (error.code !== 'EEXIST' || await fs.realpath(localModules) !== await fs.realpath(modules)) throw error;
}
const managedRequire = createRequire(path.join(outputDir, 'artifact-loader.cjs'));
const {Workbook, SpreadsheetFile} = await import(pathToFileURL(managedRequire.resolve('@oai/artifact-tool')).href);
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
const accent = '#174E40';
function columnName(index) {
  let value = index + 1, name = '';
  while (value) { name = String.fromCharCode(65 + (value - 1) % 26) + name; value = Math.floor((value - 1) / 26); }
  return name;
}
function addTable(workbook, table) {
  const sheet = workbook.worksheets.add(table.name);
  sheet.showGridLines = false;
  const lastRow = table.rows.length + 1;
  const lastColumn = columnName(table.headers.length - 1);
  const range = sheet.getRange(`A1:${lastColumn}${lastRow}`);
  // Artifact Tool requires an apostrophe for literal text starting with '='.
  const textValue = value => typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
  range.values = [table.headers, ...table.rows.map(row => row.map(textValue))];
  range.format.font = {name: 'Arial', size: 11, color: '#24372E'};
  range.format.columnWidth = 20;
  range.format.verticalAlignment = 'top';
  range.format.wrapText = true;
  const excelTable = sheet.tables.add(`A1:${lastColumn}${lastRow}`, true, table.table_name);
  excelTable.showFilterButton = true;
  const widths = [];
  for (const [i, header] of table.headers.entries()) {
    const col = columnName(i);
    const column = sheet.getRange(`${col}1:${col}${lastRow}`);
    let width = 20;
    if (/주장 원문|주장 요약|판정 근거|분류근거|조건·맥락|비고|인용 구간/.test(header)) width = 64;
    else if (/영상 제목|채널명|직업_자격_설명|URL|^분류$/.test(header)) width = 42;
    else if (/ID|코드|근거수준/.test(header)) width = 30;
    column.format.columnWidth = width;
    widths.push(width);
    if (typeof table.rows[0]?.[i] === 'number') {
      const numeric = sheet.getRange(`${col}2:${col}${lastRow}`);
      numeric.setNumberFormat(header.endsWith('_pct') ? '0.00' : '#,##0');
      numeric.format.horizontalAlignment = 'right';
    }
  }
  const header = sheet.getRange(`A1:${lastColumn}1`);
  header.format = {fill: accent, font: {name: 'Arial', size: 11, bold: true, color: '#FFFFFF'},
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, rowHeight: 42};
  header.format.borders = {insideVertical: {style: 'thin', color: '#FFFFFF'}};
  // Size wrapped research text explicitly; automatic row fitting underestimates Korean text.
  for (const [index, row] of table.rows.entries()) {
    const lines = Math.max(...row.map((value, col) => String(value).split('\n').reduce((sum, line) => {
      const units = [...line].reduce((total, char) => total + (char.codePointAt(0) > 255 ? 2 : 1), 0);
      return sum + Math.max(1, Math.ceil(units / (widths[col] - 3)));
    }, 0)));
    sheet.getRange(`A${index + 2}:${lastColumn}${index + 2}`).format.rowHeight = Math.min(409, Math.max(30, lines * 16 + 10));
  }
  sheet.freezePanes.freezeRows(1);
  sheet.tabColor = accent;
  const notesColumn = columnName(table.headers.length + 1);
  const notes = sheet.getRange(`${notesColumn}1:${notesColumn}5`);
  notes.values = [['자료 출처: ' + table.source], [table.scope],
    ['분석일: ' + data.analysis_date], ['재검토: ' + data.review_id], ['AI 코딩 결과 · 사람 검토 대기']];
  notes.format.font = {name: 'Arial', size: 11, color: '#596B60'};
  notes.format.columnWidth = 110;
  notes.format.wrapText = false;
}
const filenames = ['claims.xlsx', 'channel_summary.xlsx', 'type_summary.xlsx'];
const exports = [{filename: 'analysis_data.xlsx', tables: data.tables},
  ...data.tables.map((table, index) => ({filename: filenames[index], tables: [table]}))];
for (const job of exports) {
  const workbook = Workbook.create();
  for (const table of job.tables) addTable(workbook, table);
  workbook.recalculate();
  console.log((await workbook.inspect({kind: 'table', range: `'${job.tables[0].name}'!A1:H3`, include: 'values,formulas', tableMaxRows: 3, tableMaxCols: 8, maxChars: 1200})).ndjson);
  console.log((await workbook.inspect({kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!', options: {useRegex: true, maxResults: 20}, maxChars: 600, summary: 'final formula error scan'})).ndjson);
  if (job.tables.length === 1) {
    const table = job.tables[0];
    const preview = await workbook.render({sheetName: table.name, range: table.name === '주장 309건' ? 'A1:H4' : 'A1:G5', scale: 1, format: 'png'});
    await fs.writeFile(path.join(outputDir, job.filename.replace('.xlsx', '.png')), new Uint8Array(await preview.arrayBuffer()));
  }
  const output = path.join(outputDir, job.filename);
  await (await SpreadsheetFile.exportXlsx(workbook)).save(output);
  await fs.copyFile(output, path.join(args.site, 'assets/analysis', job.filename));
  console.log(JSON.stringify({workbook: output, sheets: job.tables.map(table => ({name: table.name, rows: table.rows.length}))}));
}
