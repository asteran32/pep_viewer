#!/usr/bin/env python3
"""Bundle the project's Markdown codebook as a static, readable HTML page."""
import argparse
from html import escape
from pathlib import Path
import re

SITE = Path(__file__).resolve().parents[1]
SOURCE = SITE.parent / 'codebook' / 'codebook_v2.2.md'
LIST = re.compile(r'^(\s*)(?:(\d+)\.|[-*])\s+(.+)$')


def inline(text):
    output = []
    for token in re.split(r'(`[^`]+`|\*\*[^*]+\*\*)', text):
        if token.startswith('`') and token.endswith('`'):
            output.append('<code>' + escape(token[1:-1]) + '</code>')
        elif token.startswith('**') and token.endswith('**'):
            output.append('<strong>' + inline(token[2:-2]) + '</strong>')
        else:
            output.append(escape(token))
    return ''.join(output)


def render_list(lines, start):
    first = LIST.match(lines[start])
    indent, ordered = len(first[1]), bool(first[2])
    items, i = [], start
    while i < len(lines):
        if not lines[i].strip():
            next_item = LIST.match(lines[i + 1]) if i + 1 < len(lines) else None
            if next_item and len(next_item[1]) >= indent:
                i += 1
                continue
            break
        match = LIST.match(lines[i])
        if not match or len(match[1]) < indent:
            break
        if len(match[1]) > indent and items:
            child, i = render_list(lines, i)
            items[-1] += child
            continue
        if len(match[1]) != indent or bool(match[2]) != ordered:
            break
        items.append(inline(match[3]))
        i += 1
    tag = 'ol' if ordered else 'ul'
    attribute = f' start="{int(first[2])}"' if ordered else ''
    return f'<{tag}{attribute}>' + ''.join('<li>' + item + '</li>' for item in items) + f'</{tag}>', i


def render(content):
    lines, blocks, toc = content.splitlines(), [], []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        heading = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading:
            level = len(heading[1])
            if level > 1:
                anchor = f'codebook-{i}'
                blocks.append(f'<h{level} id="{anchor}">{inline(heading[2])}</h{level}>')
                if level == 2:
                    toc.append(f'<a href="#{anchor}">{inline(heading[2])}</a>')
            i += 1
            continue
        if line.startswith('|') and i + 1 < len(lines) and re.match(r'^\|\s*:?-{3,}', lines[i + 1]):
            cells = lambda text: [cell.strip() for cell in text.strip().strip('|').split('|')]
            headers, rows = cells(line), []
            i += 2
            while i < len(lines) and lines[i].startswith('|'):
                row = cells(lines[i])
                rows.append('<tr>' + ''.join('<td>' + inline(row[col] if col < len(row) else '') + '</td>' for col in range(len(headers))) + '</tr>')
                i += 1
            label = escape(' · '.join(headers), quote=True)
            blocks.append(f'<div class="codebook-table" tabindex="0" role="region" aria-label="{label} 표"><table><thead><tr>' + ''.join('<th scope="col">' + inline(cell) + '</th>' for cell in headers) + '</tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>')
            continue
        if LIST.match(line):
            block, i = render_list(lines, i)
            blocks.append(block)
            continue
        if line.startswith('> '):
            blocks.append('<blockquote>' + inline(line[2:]) + '</blockquote>')
            i += 1
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^#{1,6}\s|^\||^> ', lines[i]) and not LIST.match(lines[i]):
            paragraph.append(lines[i])
            i += 1
        blocks.append('<p>' + inline('\n'.join(paragraph)) + '</p>')
    return '\n'.join(blocks), '\n'.join(toc)


def export_codebook(source, site):
    content = source.read_text(encoding='utf-8')
    body, toc = render(content)
    header = re.search(r'<header class="site-header">.*?</header>', (site / 'index.html').read_text(encoding='utf-8'), re.S)[0]
    header = header.replace('href="./index.html" aria-current="page"', 'href="./index.html"').replace('href="./codebook.html"', 'href="./codebook.html" aria-current="page"')
    heading = content.splitlines()[0].lstrip('# ')
    page = f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#174e40">
  <title>PEP Viewer · 코드북 2.2</title>
  <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./src/styles.css">
  <link rel="stylesheet" href="./src/codebook.css">
</head>
<body>
  <a class="skip-link" href="#codebook-document">코드북 본문으로 이동</a>
  {header}
  <main class="codebook-page">
    <section class="workspace-heading">
      <div><p class="eyebrow">분류 기준</p><h1>코드북 2.2</h1><p class="subtitle">{escape(heading)}</p></div>
      <a class="source-button" href="./assets/codebook_v2.2.md" download>코드북 원문 다운로드 ↓</a>
    </section>
    <div class="codebook-layout">
      <nav class="codebook-toc" aria-label="코드북 목차"><h2>목차</h2>{toc}</nav>
      <article id="codebook-document" class="codebook-document" tabindex="-1">{body}</article>
    </div>
    <footer class="site-footer"><span>PEP · 반려동물 영양 주장 분석</span><a href="./index.html">공개 데이터로 돌아가기 →</a></footer>
  </main>
</body>
</html>
'''
    (site / 'assets').mkdir(parents=True, exist_ok=True)
    (site / 'assets' / 'codebook_v2.2.md').write_text(content, encoding='utf-8')
    (site / 'codebook.html').write_text(page, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--site', type=Path, default=SITE)
    args = parser.parse_args()
    export_codebook(args.source, args.site)
    print('Codebook 2.2 bundled as codebook.html with source download.')
