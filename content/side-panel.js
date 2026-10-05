(function () {
  const STORAGE_KEY = 'wtpSidePanelState';
  let panelApp = null;
  let hostEl = null;
  let shadowRoot = null;
  let panelInner = null;

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveState(partial) {
    const next = { ...loadState(), ...partial };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function applyPanelClasses() {
    if (!panelInner) return;
    const state = loadState();
    panelInner.classList.toggle('wtp-hidden', !state.visible);
    panelInner.classList.toggle('wtp-minimized', !!state.minimized);
    hostEl.classList.toggle('wtp-host-hidden', !state.visible);

    const btn = panelInner.querySelector('.wtp-btn-minimize');
    if (btn) {
      btn.textContent =
        typeof wtpBilingual === 'function'
          ? wtpBilingual(state.minimized ? 'maximize' : 'minimize')
          : state.minimized
            ? 'Expand'
            : 'Minimize';
    }
  }

  function buildPanelHtml() {
    return `
      <div class="wtp-side-header">
        <span class="wtp-side-title"></span>
        <button type="button" class="wtp-btn-minimize"></button>
      </div>
      <div class="wtp-panel-body">
        <header class="wtp-tabs">
          <button type="button" class="wtp-tab active" data-tab="research" data-i18n-btn="tabResearch">Research</button>
          <button type="button" class="wtp-tab" data-tab="timer" data-i18n-btn="tabTimer">Timer</button>
          <button type="button" class="wtp-tab" data-tab="notes" data-i18n-btn="tabNotes">Notes</button>
          <button type="button" class="wtp-tab" data-tab="vocab" data-i18n-btn="tabVocab">Vocab</button>
          <button type="button" class="wtp-tab" data-tab="sentences" data-i18n-btn="tabSentences">Sentences</button>
          <button type="button" class="wtp-tab" data-tab="settings" data-i18n-btn="tabSettings">Settings</button>
        </header>
        <section id="panel-research" class="wtp-panel wtp-research-panel active">
          <div class="wtp-research-heading">
            <span class="wtp-research-kicker" data-i18n="researchEyebrow">LITERATURE FINDER</span>
            <h2 data-i18n="researchTitle">Find the paper behind the idea.</h2>
            <p data-i18n="researchIntro">Search scholarly indexes, then bring useful passages back to your notes and mind map.</p>
          </div>
          <form id="literature-search-form" class="wtp-research-form">
            <label class="wtp-research-query-label" for="literature-query" data-i18n="researchQueryLabel">Topic, title, DOI, author, or quoted phrase</label>
            <input id="literature-query" type="search" autocomplete="off" data-i18n="researchQueryPlaceholder" placeholder="e.g. retrieval augmented generation evaluation" />
            <div class="wtp-research-provider-row">
              <label for="literature-provider" data-i18n="researchProvider">Index</label>
              <select id="literature-provider">
                <option value="scholar">Google Scholar</option>
                <option value="semantic">Semantic Scholar</option>
                <option value="pubmed">PubMed</option>
                <option value="arxiv">arXiv</option>
              </select>
            </div>
            <div class="wtp-research-lenses">
              <button type="button" class="wtp-research-lens" data-suffix-en=" systematic review" data-suffix-zh=" 系统综述" data-i18n-btn="researchLensReview">Review</button>
              <button type="button" class="wtp-research-lens" data-suffix-en=" open access" data-suffix-zh=" 开放获取" data-i18n-btn="researchLensOpen">Open access</button>
              <button type="button" class="wtp-research-lens" data-suffix-en=" methodology" data-suffix-zh=" 方法论" data-i18n-btn="researchLensMethod">Methods</button>
            </div>
            <button type="submit" id="literature-search-submit" class="wtp-research-search" data-i18n-btn="researchSearch">Search papers</button>
            <p id="literature-search-status" class="wtp-research-status" role="status" aria-live="polite"></p>
          </form>
        </section>
        <section id="panel-timer" class="wtp-panel">
          <p id="timer-status" class="wtp-status" data-i18n="timerIdle">Set a duration and press Start</p>
          <div class="wtp-countdown" id="countdown">00:00:00</div>
          <div class="wtp-time-inputs">
            <label><span data-i18n="hours">Hours</span><input type="number" id="hours" min="0" max="99" value="0" /></label>
            <label><span data-i18n="minutes">Minutes</span><input type="number" id="minutes" min="0" max="59" value="5" /></label>
            <label><span data-i18n="seconds">Seconds</span><input type="number" id="seconds" min="0" max="59" value="0" /></label>
          </div>
          <div class="wtp-btn-row">
            <button type="button" id="btn-start" class="wtp-primary" data-i18n-btn="start">Start</button>
            <button type="button" id="btn-pause" disabled data-i18n-btn="pause">Pause</button>
            <button type="button" id="btn-reset" data-i18n-btn="reset">Reset</button>
          </div>
        </section>
        <section id="panel-notes" class="wtp-panel">
          <div class="wtp-notes-toolbar">
            <button type="button" id="btn-add-note" class="wtp-primary" data-i18n-btn="addNoteOnPage">Add note</button>
            <select id="label-filter"><option value="" data-i18n="allLabels">All labels</option></select>
          </div>
          <ul id="notes-list" class="wtp-notes-list"></ul>
          <p id="notes-empty" class="wtp-empty wtp-hidden" data-i18n="noNotes">No notes</p>
        </section>
        <section id="panel-vocab" class="wtp-panel">
          <div class="wtp-notes-toolbar">
            <select id="vocab-label-filter"><option value="" data-i18n="allLabels">All labels</option></select>
          </div>
          <ul id="vocab-list" class="wtp-notes-list wtp-study-list"></ul>
          <p id="vocab-empty" class="wtp-empty wtp-hidden" data-i18n="noVocab">No vocabulary</p>
        </section>
        <section id="panel-sentences" class="wtp-panel">
          <div class="wtp-notes-toolbar">
            <select id="sentence-label-filter"><option value="" data-i18n="allLabels">All labels</option></select>
          </div>
          <ul id="sentence-list" class="wtp-notes-list wtp-study-list"></ul>
          <p id="sentence-empty" class="wtp-empty wtp-hidden" data-i18n="noSentences">No sentences</p>
        </section>
        <section id="panel-settings" class="wtp-panel">
          <label>
            <span data-i18n="uiLanguage">UI language</span>
            <select id="ui-locale"><option value="en">English</option><option value="zh">中文</option></select>
          </label>
          <label>
            <span data-i18n="targetLanguage">Translation target</span>
            <select id="target-lang"></select>
          </label>
          <p id="provider-display" class="wtp-provider-line"></p>
          <p><a href="#" id="open-options" data-i18n="openOptions">API settings</a></p>
        </section>
      </div>
    `;
  }

  function initPanel() {
    if (hostEl) return panelApp;

    hostEl = document.createElement('div');
    hostEl.id = 'wtp-side-panel-host';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('content/side-panel.css');
    shadowRoot.appendChild(link);

    panelInner = document.createElement('div');
    panelInner.id = 'wtp-side-panel';
    panelInner.className = 'wtp-hidden';
    panelInner.innerHTML = buildPanelHtml();
    shadowRoot.appendChild(panelInner);
    document.body.appendChild(hostEl);

    const titleEl = panelInner.querySelector('.wtp-side-title');
    if (titleEl && typeof wtpBilingual === 'function') {
      titleEl.textContent = wtpBilingual('panelTitle');
    }

    panelInner.querySelector('.wtp-btn-minimize')?.addEventListener('click', () => {
      const state = loadState();
      if (!state.visible) {
        saveState({ visible: true, minimized: false });
      } else {
        saveState({ minimized: !state.minimized });
      }
      applyPanelClasses();
      if (!loadState().minimized && panelApp) panelApp.refreshAll();
    });

    const body = panelInner.querySelector('.wtp-panel-body');
    panelApp = wtpInitPanelApp(body, {
      inPage: true,
      onAddNote: () => {
        if (typeof globalThis.wtpShowNoteModal === 'function') {
          globalThis.wtpShowNoteModal();
        }
      }
    });

    const saved = loadState();
    if (saved.visible === undefined) {
      saveState({ visible: false, minimized: false });
    }
    applyPanelClasses();

    return panelApp;
  }

  function togglePanel() {
    initPanel();
    const state = loadState();
    const nextVisible = !state.visible;
    saveState({
      visible: nextVisible,
      minimized: nextVisible ? state.minimized : false
    });
    applyPanelClasses();
    if (nextVisible && !loadState().minimized && panelApp) {
      panelApp.refreshAll();
    }
  }

  function openSidePanelTab(tabName) {
    initPanel();
    saveState({ visible: true, minimized: false });
    applyPanelClasses();
    if (panelApp) {
      panelApp.switchToTab(tabName);
      panelApp.refreshAll();
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_SIDE_PANEL') togglePanel();
    if (msg.type === 'OPEN_SIDE_PANEL_TAB' && msg.tab) {
      openSidePanelTab(msg.tab);
    }
    if (msg.type === 'REFRESH_SIDE_PANEL') {
      initPanel();
      if (panelApp) panelApp.refreshAll();
    }
  });

  globalThis.wtpOpenSidePanelTab = openSidePanelTab;

  initPanel();
})();
