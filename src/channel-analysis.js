const root = document.getElementById('channel-analysis');
if (root) {
  const q = id => document.getElementById(id);
  const rows = [...root.querySelectorAll('[data-channel-row]')];
  const search = q('channel-search');
  const type = q('channel-type-filter');
  const sort = q('channel-sort');
  const normalize = value => value.normalize('NFC').toLocaleLowerCase('ko-KR');

  function filterChannels() {
    const query = normalize(search.value.trim());
    const ordered = [...rows].sort((a, b) => {
      const difference = sort.value === 'rate' ? Number(b.dataset.rate) - Number(a.dataset.rate)
        : sort.value === 'high' ? Number(b.dataset.high) - Number(a.dataset.high) : 0;
      return difference || a.dataset.channelRow.localeCompare(b.dataset.channelRow);
    });
    let count = 0, claims = 0;
    const fragment = document.createDocumentFragment();
    for (const row of ordered) {
      const match = (!query || normalize(row.dataset.search).includes(query)) && (!type.value || row.dataset.type === type.value);
      row.hidden = !match;
      const button = row.querySelector('[data-channel-evidence]');
      const evidence = q(button.getAttribute('aria-controls'));
      evidence.hidden = !match || button.getAttribute('aria-expanded') !== 'true';
      fragment.append(row, evidence);
      if (match) { count++; claims += Number(row.dataset.claims); }
    }
    q('channel-result-rows').insertBefore(fragment, q('channel-empty'));
    q('channel-empty').hidden = count > 0;
    q('channel-results-status').textContent = `${count}개 채널 · ${claims}개 주장`;
    q('channel-reset').hidden = !search.value && !type.value && sort.value === 'high';
  }

  function showEvidence(code, force) {
    const button = root.querySelector(`[data-channel-evidence="${code}"]`);
    if (!button) return;
    const open = force ?? button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    q(button.getAttribute('aria-controls')).hidden = !open;
    q(`channel-${code}`).classList.toggle('is-open', open);
    if (open) root.querySelector('.channel-results-scroll').scrollTo({left: 0, behavior: 'instant'});
    return button;
  }

  q('channel-controls').addEventListener('submit', event => event.preventDefault());
  search.addEventListener('input', filterChannels);
  type.addEventListener('change', filterChannels);
  sort.addEventListener('change', filterChannels);
  q('channel-reset').addEventListener('click', () => {
    q('channel-controls').reset();
    filterChannels();
    search.focus();
  });
  for (const button of root.querySelectorAll('[data-channel-evidence]')) {
    button.addEventListener('click', () => showEvidence(button.dataset.channelEvidence));
  }
  for (const link of root.querySelectorAll('[data-channel-jump]')) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      q('channel-controls').reset();
      filterChannels();
      const code = link.dataset.channelJump;
      const button = showEvidence(code, true);
      history.replaceState(null, '', `#channel-${code}`);
      q(`channel-${code}`).scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
      button.focus({preventScroll: true});
    });
  }
  filterChannels();
  if (/^#channel-C\d{2}$/.test(location.hash)) {
    showEvidence(location.hash.slice('#channel-'.length), true);
  }
}
