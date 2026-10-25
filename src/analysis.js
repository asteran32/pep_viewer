// Progressive enhancement: the report, charts and downloads are static HTML.
const q = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('analysis-enhanced');

const chartTabs = [...document.querySelectorAll('[data-chart-tab]')];
function selectChart(tab) {
  for (const item of chartTabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    q(item.getAttribute('aria-controls')).hidden = !active;
  }
  if (!reducedMotion) {
    const panel = q(tab.getAttribute('aria-controls'));
    panel.classList.remove('chart-animate');
    requestAnimationFrame(() => panel.classList.add('chart-animate'));
  }
}
for (const [index, tab] of chartTabs.entries()) {
  tab.addEventListener('click', () => selectChart(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % chartTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + chartTabs.length) % chartTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = chartTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    chartTabs[next].focus();
    selectChart(chartTabs[next]);
  });
}

for (const button of document.querySelectorAll('[data-expand-chart]')) {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    for (const row of q(button.dataset.expandChart).querySelectorAll('[data-extra]')) row.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? '상위 8개만 보기 ↑' : `전체 ${button.dataset.total}개 유형 보기 ↓`;
    button.closest('.chart-foot').querySelector('p').firstChild.textContent = expanded
      ? `전체 ${button.dataset.total}개 유형 · 기존 모델 분류` : '상위 8개 유형 · 기존 모델 분류';
  });
}

for (const button of document.querySelectorAll('[data-evidence-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.evidenceMode;
    q('evidence-chart').dataset.mode = mode;
    for (const control of document.querySelectorAll('[data-evidence-mode]')) {
      control.setAttribute('aria-pressed', String(control === button));
    }
    const labels = mode === 'percent' ? ['0%', '25%', '50%', '75%', '100%'] : q('evidence-axis').dataset.countTicks.split(',');
    q('evidence-axis').replaceChildren(...labels.map(label => {
      const span = document.createElement('span');
      span.textContent = label;
      return span;
    }));
    q('evidence-mode-help').textContent = mode === 'percent'
      ? '가로축: 각 근거 등급 안의 위험도 비율 (합계 100%). 막대 안 숫자는 주장 수, 오른쪽 비율은 전체 309개 중 비율입니다.'
      : '가로축: 주장 수. 오른쪽은 등급별 전체 주장 수와 309개 중 비율입니다. 등급을 누르면 위험도별 정확한 수치를 확인할 수 있습니다.';
  });
}

const report = q('full-report');
function openReportTarget(hash, scroll = true) {
  const id = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(id);
  if (!target || (target !== report && !report.contains(target))) return false;
  report.open = true;
  if (scroll) requestAnimationFrame(() => target.scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth', block: 'start'}));
  return true;
}
for (const link of document.querySelectorAll('[data-report-link]')) {
  link.addEventListener('click', event => {
    // Keep a normal link available without JS; open the disclosure before navigating.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    report.open = true;
  });
}
addEventListener('hashchange', () => openReportTarget(location.hash));
openReportTarget(location.hash);

const navLinks = [...document.querySelectorAll('.analysis-toc a')];
const sections = navLinks.map(link => q(link.hash.slice(1)));
function updateSection() {
  const offset = innerWidth <= 900 ? 130 : 100;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= offset) current = section;
  }
  for (const link of navLinks) {
    if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
let scrollQueued = false;
addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => { updateSection(); scrollQueued = false; });
}, {passive: true});
addEventListener('resize', updateSection);
updateSection();

if (!reducedMotion && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('chart-animate');
      observer.unobserve(entry.target);
    }
  }, {threshold: 0.12});
  for (const chart of document.querySelectorAll('.bar-chart, .evidence-chart')) observer.observe(chart);
}

const dialog = q('figure-dialog');
const viewport = q('figure-viewport');
let opener = null;
for (const link of document.querySelectorAll('[data-figure]')) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    opener = link;
    const src = link.getAttribute('href');
    q('figure-title').textContent = link.dataset.figureTitle;
    q('figure-image').src = src;
    q('figure-image').alt = link.dataset.figureTitle;
    q('figure-download').href = src;
    q('figure-download').download = `${link.dataset.figure}.png`;
    viewport.dataset.zoom = 'false';
    q('figure-zoom').setAttribute('aria-pressed', 'false');
    q('figure-zoom').textContent = '원본 크기';
    document.body.classList.add('dialog-open');
    dialog.showModal();
    q('figure-close').focus();
  });
}
q('figure-zoom').addEventListener('click', () => {
  const zoomed = viewport.dataset.zoom !== 'true';
  viewport.dataset.zoom = String(zoomed);
  q('figure-zoom').setAttribute('aria-pressed', String(zoomed));
  q('figure-zoom').textContent = zoomed ? '화면에 맞추기' : '원본 크기';
  viewport.scrollTo({left: 0, top: 0});
});
q('figure-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  opener?.focus({preventScroll: true});
});
