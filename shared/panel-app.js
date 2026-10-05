function wtpInitPanelApp(root, options = {}) {
  let uiLocale = 'zh';
  let countdownInterval = null;
  let extensionContextInvalidated = false;
  const inPage = !!options.inPage;

  const $ = (id) => root.querySelector(`#${id}`);

  function isExtensionContextInvalidated(error) {
    return /extension context invalidated/i.test(error?.message || String(error || ''));
  }

  async function sendRuntimeMessage(message) {
    if (extensionContextInvalidated) return null;
    try {
      return await browser.runtime.sendMessage(message);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        extensionContextInvalidated = true;
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        return null;
      }
      throw error;
    }
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function getDurationMs() {
    const h = parseInt($('hours')?.value, 10) || 0;
    const m = parseInt($('minutes')?.value, 10) || 0;
    const s = parseInt($('seconds')?.value, 10) || 0;
    return (h * 3600 + m * 60 + s) * 1000;
  }

  function setStatusKey(key) {
    const el = $('timer-status');
    if (!el) return;
    const s = wtpGetStrings(uiLocale);
    el.textContent = s[key] || key;
  }

  function providerLabel(provider) {
    const map = {
      free: 'providerFree',
      libre: 'providerLibre',
      google: 'providerGoogle',
      deepl: 'providerDeepL'
    };
    const key = map[provider] || 'provider';
    return wtpGetStrings(uiLocale)[key] || provider;
  }

  async function refreshTimerUi() {
    const res = await sendRuntimeMessage({ type: 'TIMER_GET' });
    if (!res) return;
    const state = res?.state;
    const countdown = $('countdown');
    const btnStart = $('btn-start');
    const btnPause = $('btn-pause');
    if (!countdown || !btnStart || !btnPause) return;

    if (!state) {
      countdown.textContent = formatMs(getDurationMs());
      setStatusKey('timerIdle');
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnPause.textContent = wtpBilingual('pause');
      if ($('hours')) $('hours').disabled = false;
      if ($('minutes')) $('minutes').disabled = false;
      if ($('seconds')) $('seconds').disabled = false;
      return;
    }

    if ($('hours')) $('hours').disabled = true;
    if ($('minutes')) $('minutes').disabled = true;
    if ($('seconds')) $('seconds').disabled = true;

    if (state.status === 'running') {
      const left = Math.max(0, state.endTime - Date.now());
      countdown.textContent = formatMs(left);
      setStatusKey('timerRunning');
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.textContent = wtpBilingual('pause');
    } else if (state.status === 'paused') {
      countdown.textContent = formatMs(state.remainingMs || 0);
      setStatusKey('timerPaused');
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.textContent = wtpBilingual('resume');
    }
  }

  function startCountdownTick() {
    if (extensionContextInvalidated) return;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      refreshTimerUi().catch((error) => console.error('[WTP] Panel timer refresh failed', error));
    }, 1000);
  }

  async function loadSettings() {
    const res = await sendRuntimeMessage({ type: 'GET_SETTINGS' });
    if (!res) return;
    const settings = res?.settings || {};
    uiLocale = settings.uiLocale || 'zh';
    if ($('ui-locale')) $('ui-locale').value = uiLocale;
    if ($('target-lang')) $('target-lang').value = settings.targetLang || 'en';
    const s = wtpGetStrings(uiLocale);
    const prov = $('provider-display');
    if (prov) {
      prov.textContent = `${s.currentProvider}: ${providerLabel(settings.provider || 'free')}`;
    }
    wtpApplyI18n(root, uiLocale);
    const timerRes = await sendRuntimeMessage({ type: 'TIMER_GET' });
    if ($('btn-pause')) {
      $('btn-pause').textContent =
        timerRes?.state?.status === 'paused' ? wtpBilingual('resume') : wtpBilingual('pause');
    }
  }

  function fillLangSelect() {
    const sel = $('target-lang');
    if (!sel) return;
    sel.innerHTML = '';
    WTP_LANG_OPTIONS.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.code;
      o.textContent = opt.name;
      sel.appendChild(o);
    });
  }

  function activateTab(tabName) {
    const tabs = root.querySelectorAll('.wtp-tab, .tab');
    const panels = root.querySelectorAll('.wtp-panel, .panel');
    const btn = root.querySelector(`.wtp-tab[data-tab="${tabName}"], .tab[data-tab="${tabName}"]`);
    if (!btn) return;
    tabs.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = root.querySelector(`#panel-${tabName}`);
    if (panel) panel.classList.add('active');
    if (tabName === 'notes') loadNotes();
    if (tabName === 'vocab') loadStudyList('vocab');
    if (tabName === 'sentences') loadStudyList('sentences');
    if (tabName === 'research' && inPage) {
      const queryInput = $('literature-query');
      const selection = window.getSelection?.().toString().trim();
      if (queryInput && !queryInput.value && selection && selection.length <= 500) {
        queryInput.value = selection;
      }
    }
  }

  function switchToTab(tabName) {
    activateTab(tabName);
  }

  function setupTabs() {
    const tabs = root.querySelectorAll('.wtp-tab, .tab');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function notifyTimer() {
    if (options.onTimerChange) options.onTimerChange();
    if (globalThis.wtpTimerUi?.refreshBadge) globalThis.wtpTimerUi.refreshBadge();
  }

  function openUrl(url) {
    if (!url) return;
    if (inPage) {
      window.open(url, '_blank');
    } else {
      browser.tabs.create({ url });
    }
  }

  function renderStudyListItem(item, deleteType) {
    const li = document.createElement('li');
    li.className = 'note-item study-item';
    const date = new Date(item.createdAt).toLocaleString();
    li.innerHTML = `
      <span class="label"></span>
      <p class="study-original"></p>
      <p class="study-translation"></p>
      <p class="study-remark"></p>
      <div class="meta"></div>
      <a class="url" href="#" target="_blank" rel="noopener"></a>
      <div class="actions">
        <button type="button" class="open-btn"></button>
        <button type="button" class="del-btn"></button>
      </div>
    `;
    li.querySelector('.label').textContent = item.label;
    li.querySelector('.study-original').textContent = item.original;
    li.querySelector('.study-translation').textContent = item.translation || '—';
    const remarkEl = li.querySelector('.study-remark');
    if (item.remark) {
      remarkEl.textContent = item.remark;
      remarkEl.classList.add('remark');
    } else {
      remarkEl.remove();
    }
    li.querySelector('.meta').textContent = `${item.title || ''} · ${date}`;
    const link = li.querySelector('.url');
    link.href = item.url;
    link.textContent = item.url;
    li.querySelector('.open-btn').textContent = wtpBilingual('openUrl');
    li.querySelector('.del-btn').textContent = wtpBilingual('delete');
    li.querySelector('.open-btn').addEventListener('click', (e) => {
      e.preventDefault();
      openUrl(item.url);
    });
    li.querySelector('.del-btn').addEventListener('click', async () => {
      await sendRuntimeMessage({ type: deleteType, id: item.id });
      loadStudyList(deleteType === 'DELETE_VOCAB' ? 'vocab' : 'sentences');
    });
    return li;
  }

  async function loadStudyList(kind) {
    const isVocab = kind === 'vocab';
    const getType = isVocab ? 'GET_VOCAB' : 'GET_SENTENCES';
    const delType = isVocab ? 'DELETE_VOCAB' : 'DELETE_SENTENCE';
    const filterId = isVocab ? 'vocab-label-filter' : 'sentence-label-filter';
    const listId = isVocab ? 'vocab-list' : 'sentence-list';
    const emptyId = isVocab ? 'vocab-empty' : 'sentence-empty';

    const filterEl = $(filterId);
    const list = $(listId);
    const emptyEl = $(emptyId);
    if (!list) return;

    const res = await sendRuntimeMessage({ type: getType });
    const items = res?.items || [];
    const filter = filterEl?.value || '';
    const s = wtpGetStrings(uiLocale);

    if (filterEl) {
      const labels = [...new Set(items.map((n) => n.label))].sort();
      const current = filterEl.value;
      filterEl.innerHTML = `<option value="">${s.allLabels}</option>`;
      labels.forEach((l) => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = l;
        filterEl.appendChild(o);
      });
      filterEl.value = current;
    }

    const filtered = filter ? items.filter((n) => n.label === filter) : items;
    const sorted = wtpSortStudyItems(filtered, wtpGetListSort(isVocab ? 'vocab' : 'sentences'));
    list.innerHTML = '';
    if (emptyEl) {
      const hide = sorted.length > 0;
      emptyEl.classList.toggle('hidden', hide);
      emptyEl.classList.toggle('wtp-hidden', hide);
    }

    sorted.forEach((item) => {
      list.appendChild(renderStudyListItem(item, delType));
    });
  }

  async function loadNotes() {
    const res = await sendRuntimeMessage({ type: 'GET_NOTES' });
    const notes = res?.notes || [];
    const filterEl = $('label-filter');
    const list = $('notes-list');
    const emptyEl = $('notes-empty');
    if (!list) return;

    const filter = filterEl?.value || '';
    const s = wtpGetStrings(uiLocale);

    if (filterEl) {
      const labels = [...new Set(notes.map((n) => n.label))].sort();
      const current = filterEl.value;
      filterEl.innerHTML = `<option value="">${s.allLabels}</option>`;
      labels.forEach((l) => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = l;
        filterEl.appendChild(o);
      });
      filterEl.value = current;
    }

    const filtered = filter ? notes.filter((n) => n.label === filter) : notes;
    const sorted = wtpSortNotes(filtered, wtpGetListSort('notes'));
    list.innerHTML = '';
    if (emptyEl) {
      const hide = sorted.length > 0;
      emptyEl.classList.toggle('hidden', hide);
      emptyEl.classList.toggle('wtp-hidden', hide);
    }

    sorted.forEach((note) => {
      const li = document.createElement('li');
      li.className = 'note-item';
      const date = new Date(note.createdAt).toLocaleString();
      li.innerHTML = `
        <span class="label"></span>
        <p class="body"></p>
        <div class="meta"></div>
        <a class="url" href="#" target="_blank" rel="noopener"></a>
        <div class="actions">
          <button type="button" class="open-btn"></button>
          <button type="button" class="del-btn"></button>
        </div>
      `;
      li.querySelector('.label').textContent = note.label;
      li.querySelector('.body').textContent = note.body || '(empty)';
      li.querySelector('.meta').textContent = `${note.title || ''} · ${date}`;
      const link = li.querySelector('.url');
      link.href = note.url;
      link.textContent = note.url;
      li.querySelector('.open-btn').textContent = wtpBilingual('openUrl');
      li.querySelector('.del-btn').textContent = wtpBilingual('delete');
      li.querySelector('.open-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(note.url);
      });
      li.querySelector('.del-btn').addEventListener('click', async () => {
        await sendRuntimeMessage({ type: 'DELETE_NOTE', id: note.id });
        loadNotes();
      });
      list.appendChild(li);
    });
  }

  function setResearchStatus(key, isError = false) {
    const status = $('literature-search-status');
    if (!status) return;
    const strings = wtpGetStrings(uiLocale);
    status.textContent = key ? strings[key] || key : '';
    status.classList.toggle('is-error', isError);
  }

  async function runLiteratureSearch() {
    const queryInput = $('literature-query');
    const providerSelect = $('literature-provider');
    const query = queryInput?.value.trim() || '';
    if (!query) {
      setResearchStatus('researchEmpty', true);
      queryInput?.focus();
      return;
    }

    setResearchStatus('researchOpening');
    try {
      const result = await sendRuntimeMessage({
        type: 'OPEN_LITERATURE_SEARCH',
        query,
        provider: providerSelect?.value || 'scholar'
      });
      if (!result?.ok) throw new Error(result?.error || 'Search failed');
      setResearchStatus('researchOpened');
    } catch (error) {
      console.error('[WTP] Literature search failed', error);
      setResearchStatus('researchOpenFailed', true);
    }
  }

  function bindLiteratureSearch() {
    $('literature-search-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      runLiteratureSearch();
    });

    root.querySelectorAll('.research-lens, .wtp-research-lens').forEach((button) => {
      button.addEventListener('click', () => {
        const input = $('literature-query');
        if (!input) return;
        const suffix = uiLocale === 'zh' ? button.dataset.suffixZh : button.dataset.suffixEn;
        if (suffix && !input.value.includes(suffix.trim())) input.value += suffix;
        input.focus();
        setResearchStatus('');
      });
    });
  }

  function bindEvents() {
    $('btn-start')?.addEventListener('click', async () => {
      const durationMs = getDurationMs();
      const res = await sendRuntimeMessage({ type: 'TIMER_START', durationMs });
      if (!res?.ok) alert(res?.error || 'Failed');
      startCountdownTick();
      refreshTimerUi();
      notifyTimer();
    });

    $('btn-pause')?.addEventListener('click', async () => {
      const cur = await sendRuntimeMessage({ type: 'TIMER_GET' });
      const state = cur?.state;
      if (!state) return;
      if (state.status === 'running') {
        await sendRuntimeMessage({ type: 'TIMER_PAUSE' });
      } else if (state.status === 'paused') {
        await sendRuntimeMessage({ type: 'TIMER_RESUME' });
      }
      refreshTimerUi();
      notifyTimer();
    });

    $('btn-reset')?.addEventListener('click', async () => {
      await sendRuntimeMessage({ type: 'TIMER_RESET' });
      refreshTimerUi();
      notifyTimer();
    });

    $('btn-add-note')?.addEventListener('click', async () => {
      if (options.onAddNote) {
        options.onAddNote();
        return;
      }
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) return;
      try {
        await sendRuntimeMessage({ type: 'OPEN_NOTE_MODAL', tabId: tab.id });
        if (!inPage) window.close();
      } catch (e) {
        alert(e.message || String(e));
      }
    });

    $('label-filter')?.addEventListener('change', loadNotes);
    $('vocab-label-filter')?.addEventListener('change', () => loadStudyList('vocab'));
    $('sentence-label-filter')?.addEventListener('change', () => loadStudyList('sentences'));

    $('ui-locale')?.addEventListener('change', async () => {
      uiLocale = $('ui-locale').value;
      await sendRuntimeMessage({
        type: 'SAVE_SETTINGS',
        settings: { uiLocale }
      });
      await loadSettings();
      loadNotes();
      loadStudyList('vocab');
      loadStudyList('sentences');
      refreshTimerUi();
    });

    $('target-lang')?.addEventListener('change', async () => {
      await sendRuntimeMessage({
        type: 'SAVE_SETTINGS',
        settings: { targetLang: $('target-lang').value }
      });
    });

    $('open-options')?.addEventListener('click', (e) => {
      e.preventDefault();
      browser.runtime.openOptionsPage();
    });
  }

  async function refreshAll() {
    await loadSettings();
    refreshTimerUi();
    loadNotes();
    loadStudyList('vocab');
    loadStudyList('sentences');
  }

  fillLangSelect();
  setupTabs();
  bindLiteratureSearch();
  bindEvents();
  loadSettings().then(() => {
    refreshTimerUi();
    startCountdownTick();
  });

  return {
    refreshAll,
    loadSettings,
    refreshTimerUi,
    startCountdownTick,
    switchToTab
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.wtpInitPanelApp = wtpInitPanelApp;
}
