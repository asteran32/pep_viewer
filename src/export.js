import {videoHeaders, videoValues, csvText, claimTable} from './model.js';

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
export async function exportRows(rows, format, loadDetail) {
  const filename = `PEP_영상목록_${new Date().toISOString().slice(0, 10)}_${rows.length}건`;
  const values = rows.map(videoValues);
  if (format === 'csv') {
    download(csvText(videoHeaders, values), 'text/csv;charset=utf-8', filename + '.csv');
    return;
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
      column.width = i === 0 ? 52 : i === 1 ? 48 : 23;
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
  addSheet('영상 목록', videoHeaders, values);
  const ids = [...new Set(rows.map(row => row.job_id || row.id))];
  const details = [];
  // Bounded batches avoid overwhelming mobile browsers on large snapshots.
  for (let i = 0; i < ids.length; i += 6) {
    const batch = await Promise.all(ids.slice(i, i + 6).map(loadDetail));
    details.push(...batch.filter(Boolean));
  }
  const claims = claimTable(details);
  addSheet('주장 상세', claims.headers, claims.rows);
  download(await workbook.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename + '.xlsx');
}
