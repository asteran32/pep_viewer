import {csvText, claimTable} from './model.js';

let excelPromise;
function excelLibrary() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelPromise) excelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/exceljs.min.js', import.meta.url).href;
    script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('엑셀 생성 도구를 불러오지 못했습니다.'));
    script.onerror = () => { script.remove(); excelPromise = null; reject(new Error('엑셀 생성 도구를 불러오지 못했습니다. 다시 시도하세요.')); };
    document.head.append(script);
  });
  return excelPromise;
}
function download(bytes, type, filename) {
  const url = URL.createObjectURL(new Blob([bytes], {type}));
  const link = Object.assign(document.createElement('a'), {href:url, download:filename});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function exportRows(rows, format, loadDetail, filters = {}) {
  const ids = [...new Set(rows.map(row => row.job_id || row.id))];
  const details = new Map();
  // Both CSV and XLSX require individual claims. Bound concurrent detail requests.
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(ids.slice(i, i + 6).map(async id => { details.set(id, await loadDetail(id)); }));
  }
  const jobs = rows.map(row => {
    const detail = details.get(row.job_id || row.id);
    if (!detail && row.claim_count > 0) throw new Error('주장 상세를 불러오지 못했습니다. 다시 시도하세요.');
    return detail ? {...detail, metadata:{...detail.metadata,...row.metadata}} : {...row, claims:[]};
  });
  const table = claimTable(jobs, filters);
  const filename = `PEP_주장목록_${new Date().toISOString().slice(0, 10)}_${table.rows.length}행`;
  const result = {rowCount:table.rows.length, claimCount:table.claimCount, unclassifiedCount:table.unclassifiedCount};
  if (format === 'csv') {
    download(csvText(table.headers, table.rows), 'text/csv;charset=utf-8', filename + '.csv');
    return result;
  }
  const ExcelJS = await excelLibrary();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PEP Viewer';
  workbook.created = new Date();
  function parts(input) {
    if (typeof input !== 'string' || input.length <= 32767) return [input];
    const result = [];
    for (let offset = 0; offset < input.length;) {
      let end = Math.min(offset + 32767, input.length);
      // Do not split a Unicode surrogate pair at an Excel cell boundary.
      if (end < input.length && /[\uD800-\uDBFF]/.test(input[end - 1])) --end;
      result.push(input.slice(offset, end)); offset = end;
    }
    return result;
  }
  function addSheet(name, headers, data) {
    const sheet = workbook.addWorksheet(name, {views:[{state:'frozen', ySplit:1}]});
    sheet.addRow(headers);
    // Spreadsheet strings are explicit values, never formula objects. Preserve long text in continuation columns.
    const continued = [];
    for (const input of data) {
      const values = input.map(parts);
      const row = values.map((item, i) => {
        for (let part = 2; part <= item.length; part++) {
          let column = continued.find(entry => entry.index === i && entry.part === part);
          if (!column) { column = {index:i, part, position:headers.length + continued.length}; continued.push(column); }
        }
        return item[0];
      });
      for (const col of continued) row[col.position] = values[col.index][col.part - 1] ?? '';
      sheet.addRow(row);
    }
    for (const col of continued) sheet.getRow(1).getCell(col.position + 1).value = `${headers[col.index]} (계속 ${col.part})`;
    sheet.autoFilter = {from:{row:1, column:1}, to:{row:Math.max(1, sheet.rowCount), column:sheet.columnCount}};
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell(cell => {
      cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
      cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF174E40'}};
    });
    sheet.columns.forEach((column, i) => {
      const label = headers[i] || '';
      column.width = label === '주장' || label === '증거 전사 자료' ? 64 : label === '영상 제목' || label === 'YouTube URL' ? 48 : 23;
      column.alignment = {vertical:'top', wrapText:true};
    });
    sheet.eachRow((row, i) => {
      if (i > 1) {
        row.height = 42;
        if (i % 2 === 0) row.eachCell(cell => { cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFF4F7F5'}}; });
      }
    });
    return sheet;
  }
  addSheet('주장 목록', table.headers, table.rows);
  const full = claimTable(jobs, {...filters, detailed:true});
  addSheet('분류 상세', full.headers, full.rows);
  download(await workbook.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename + '.xlsx');
  return result;
}
