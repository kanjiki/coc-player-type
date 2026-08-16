(() => {
  'use strict';

  const CONFIG = window.CONTINUATION_CONFIG || {};
  const gradeScore = Object.freeze({ S: 4, A: 3, B: 2, C: 1 });
  const state = {
    data: null,
    currentSource: '',
    selectedTarget: '',
    resultShownAt: 0,
    evidenceOpened: false,
    testMode: false,
    testerId: '',
    sessionId: ''
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const normalize = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・!！?？「」『』（）()_\-―—]/g, '');

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    const params = new URLSearchParams(location.search);
    state.testMode = params.get('test') === '1' || CONFIG.defaultTestMode === true;
    state.testerId = cleanText(params.get('tester') || params.get('t') || '', 40);
    state.sessionId = getSessionId();

    setModeUI();
    bindEvents();

    try {
      if (window.CONTINUATION_DATA) {
        state.data = window.CONTINUATION_DATA;
      } else if (window.CONTINUATION_DATA_GZIP) {
        state.data = await decodeGzipJson(window.CONTINUATION_DATA_GZIP);
      } else {
        const response = await fetch(CONFIG.dataUrl || './data.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.data = await response.json();
      }
      renderAppData();
      applyQuerySearch(params);
    } catch (error) {
      console.error(error);
      $('#results').className = 'empty';
      $('#results').textContent = 'データを読み込めませんでした。ページを再読み込みしてください。';
      toast('データの読み込みに失敗しました');
    }
  }

  async function decodeGzipJson(base64) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('このブラウザは圧縮データの展開に対応していません');
    }
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  function setModeUI() {
    $('#testBanner').classList.toggle('hidden', !state.testMode);
    $('#feedbackPanel').classList.toggle('hidden', !state.testMode);
    $('#versionLabel').textContent = `${CONFIG.version || 'version unknown'}${state.testMode ? ' / test mode' : ''}`;
  }

  function bindEvents() {
    $('#searchButton').addEventListener('click', runSearch);
    $('#scenarioInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });
    $('#scopeFilter').addEventListener('change', () => {
      if (state.currentSource) renderResults(state.currentSource);
    });
    $('#showCaution').addEventListener('change', () => {
      if (state.currentSource) renderResults(state.currentSource);
    });
    $('#sendFeedback').addEventListener('click', submitFeedback);
    $('#copyFeedback').addEventListener('click', async () => {
      const text = $('#feedbackText').value;
      const copied = await copyText(text);
      toast(copied ? '回答文をコピーしました' : 'コピーできませんでした。長押しでコピーしてください');
    });
  }

  function renderAppData() {
    const { summary, seed_scenarios: seeds, evidence_grades: grades, limitations } = state.data;
    const stats = [
      [summary.seed_scenarios, '元シナリオ'],
      [summary.transition_edges, '継続実例'],
      [summary.recommendations, '推薦候補'],
      [summary.cautions, '注意事例']
    ];
    $('#stats').innerHTML = stats.map(([number, label]) =>
      `<div class="stat"><strong>${escapeHtml(number)}</strong><span>${escapeHtml(label)}</span></div>`
    ).join('');

    $('#coverageText').textContent = `現在は${summary.seed_scenarios}本の元シナリオに対応しています。`;

    $('#scenarioList').innerHTML = seeds.flatMap(seed => {
      const names = [seed.source_scenario, ...(seed.aliases || [])];
      return [...new Set(names)].map(name => `<option value="${escapeAttr(name)}"></option>`);
    }).join('');

    $('#quickButtons').innerHTML = seeds.slice(0, CONFIG.quickScenarioCount || 8).map(seed =>
      `<button class="chip" type="button" data-source="${escapeAttr(seed.source_scenario)}">${escapeHtml(seed.source_scenario)}</button>`
    ).join('');
    $$('#quickButtons [data-source]').forEach(button => {
      button.addEventListener('click', () => {
        $('#scenarioInput').value = button.dataset.source;
        runSearch();
      });
    });

    $('#legend').innerHTML = Object.entries(grades).map(([grade, text]) =>
      `<div><b>根拠 ${escapeHtml(grade)}</b>${escapeHtml(text)}</div>`
    ).join('');
    $('#limitations').innerHTML = limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function applyQuerySearch(params) {
    const source = params.get('scenario') || params.get('s') || '';
    if (!source) return;
    $('#scenarioInput').value = source;
    runSearch();
  }

  function findSource(query) {
    const needle = normalize(query);
    if (!needle || !state.data) return { exact: null, partial: [] };

    let exact = null;
    const partial = [];
    for (const seed of state.data.seed_scenarios) {
      const names = [seed.source_scenario, ...(seed.aliases || [])];
      const normalizedNames = names.map(normalize);
      if (normalizedNames.includes(needle)) {
        exact = seed.source_scenario;
        break;
      }
      if (normalizedNames.some(name => name.includes(needle) || needle.includes(name))) {
        partial.push(seed.source_scenario);
      }
    }
    return { exact, partial: [...new Set(partial)].slice(0, 8) };
  }

  function runSearch() {
    if (!state.data) return;
    const query = $('#scenarioInput').value.trim();
    const { exact, partial } = findSource(query);
    const suggestionBox = $('#matchSuggestions');

    if (exact) {
      suggestionBox.classList.add('hidden');
      state.currentSource = exact;
      state.selectedTarget = '';
      state.evidenceOpened = false;
      renderResults(exact);
      setPermalink(exact);
      return;
    }

    state.currentSource = '';
    state.selectedTarget = '';
    $('#resultSummary').textContent = '一致する元シナリオを選んでください。';
    $('#results').className = 'empty';

    if (partial.length) {
      $('#results').textContent = '候補が複数あります。下から選んでください。';
      suggestionBox.innerHTML = `<p>もしかして：</p>${partial.map(name =>
        `<button class="chip" type="button" data-suggestion="${escapeAttr(name)}">${escapeHtml(name)}</button>`
      ).join('')}`;
      suggestionBox.classList.remove('hidden');
      $$('[data-suggestion]').forEach(button => {
        button.addEventListener('click', () => {
          $('#scenarioInput').value = button.dataset.suggestion;
          runSearch();
        });
      });
    } else {
      suggestionBox.classList.add('hidden');
      $('#results').textContent = query
        ? 'このシナリオは現在の検証データにありません。正式名・略称を確認してください。'
        : '元シナリオを入力してください。';
    }
  }

  function renderResults(source) {
    const scope = $('#scopeFilter').value;
    const showCaution = $('#showCaution').checked;
    const maxResults = Number(CONFIG.maxResults) || 10;

    let items = state.data.transitions.filter(item => item.source_scenario === source);
    if (scope) items = items.filter(item => matchesScope(item.continuation_scope, scope));
    if (!showCaution) items = items.filter(item => item.status !== '注意');

    items.sort((a, b) => {
      const statusDiff = Number(a.status === '注意') - Number(b.status === '注意');
      if (statusDiff) return statusDiff;
      return (gradeScore[b.evidence_grade] || 0) - (gradeScore[a.evidence_grade] || 0);
    });
    items = items.slice(0, maxResults);

    $('#resultSummary').textContent = `${source}からの候補 ${items.length}件`;
    state.resultShownAt = Date.now();

    if (!items.length) {
      $('#results').className = 'empty';
      $('#results').textContent = 'この条件に一致する候補はまだ登録されていません。継続形態の絞り込みを外してみてください。';
      return;
    }

    $('#results').className = 'result-list';
    $('#results').innerHTML = items.map((item, index) => resultCard(item, index)).join('');

    $$('#results [data-pick]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedTarget = button.dataset.pick;
        $$('#results [data-pick]').forEach(other => {
          const active = other.dataset.pick === state.selectedTarget;
          other.classList.toggle('active', active);
          other.textContent = active ? '候補に選択中' : 'この候補を選ぶ';
        });
        if (state.testMode) $('#feedbackPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(`「${state.selectedTarget}」を選びました`);
      });
    });

    $$('#results [data-evidence]').forEach(link => {
      link.addEventListener('click', () => { state.evidenceOpened = true; });
    });
  }

  function matchesScope(rawScope, category) {
    const value = String(rawScope || '');
    if (category === 'group' || category === '自陣全員') return value.includes('自陣全員') || value.includes('複数人');
    if (category === 'pair' || category === 'ペア') return value.includes('ペア');
    if (category === 'solo' || category === '1人／HO単位') return value.includes('1人') || value.includes('HO単位');
    return true;
  }

  function resultCard(item, index) {
    const caution = item.status === '注意';
    const directLink = item.link_granularity === 'status';
    const gradeClass = item.evidence_grade === 'S' || item.evidence_grade === 'A' ? 'good' : item.evidence_grade === 'C' ? 'danger' : 'warn';
    return `
      <article class="card${caution ? ' caution' : ''}">
        <div class="card-top">
          <div>
            <h3>${escapeHtml(item.target_scenario)}</h3>
            <div class="badges">
              <span class="badge ${caution ? 'danger' : 'good'}">${escapeHtml(item.status)}</span>
              <span class="badge">${escapeHtml(item.continuation_scope)}</span>
              <span class="badge ${gradeClass}">根拠 ${escapeHtml(item.evidence_grade)}</span>
              <span class="badge">${escapeHtml(item.evidence_type)}</span>
            </div>
          </div>
          <span class="rank" aria-label="表示順位 ${index + 1}">${index + 1}</span>
        </div>
        <p class="reason">${escapeHtml(item.reason)}</p>
        <div class="card-actions">
          <a class="link" data-evidence href="${escapeAttr(item.evidence_url)}" target="_blank" rel="noopener noreferrer">
            ${directLink ? '根拠投稿を確認' : '参考ページを確認'} ↗
          </a>
          ${caution ? '' : `<button class="pick${state.selectedTarget === item.target_scenario ? ' active' : ''}" type="button" data-pick="${escapeAttr(item.target_scenario)}">${state.selectedTarget === item.target_scenario ? '候補に選択中' : 'この候補を選ぶ'}</button>`}
        </div>
      </article>`;
  }

  async function submitFeedback() {
    if (!state.testMode) return;
    const feedback = collectFeedback();
    if (!feedback.intent || !feedback.usefulness || !feedback.actionable) {
      toast('必須の3項目に回答してください');
      return;
    }
    if (!state.currentSource) {
      toast('先に元シナリオを検索してください');
      return;
    }

    const endpoint = String(CONFIG.feedbackEndpoint || '').trim();
    if (endpoint) {
      const success = await postFeedback(endpoint, feedback);
      if (success) {
        toast('回答を送信しました。ありがとうございます');
        return;
      }
    }

    const text = buildFeedbackText(feedback);
    $('#feedbackText').value = text;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'CoC継続先推薦MVP テスト回答', text });
        toast('共有画面を開きました。ありがとうございます');
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }

    const copied = await copyText(text);
    $('#shareFallback').classList.remove('hidden');
    toast(copied ? '回答文をコピーしました。Discordなどで送ってください' : '下の回答文を依頼者へ送ってください');
    $('#shareFallback').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collectFeedback() {
    const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    return {
      submittedAt: new Date().toISOString(),
      sessionId: state.sessionId,
      testerId: state.testerId,
      sourceScenario: state.currentSource,
      selectedTarget: state.selectedTarget,
      intent: radio('intent'),
      usefulness: $('#usefulness').value,
      actionable: radio('actionable'),
      missingCandidate: cleanText($('#missingCandidate').value, 160),
      comment: cleanText($('#comment').value, 500),
      evidenceOpened: state.evidenceOpened,
      secondsToFeedback: state.resultShownAt ? Math.round((Date.now() - state.resultShownAt) / 1000) : '',
      appVersion: CONFIG.version || ''
    };
  }

  function buildFeedbackText(data) {
    return [
      '【CoC継続先推薦MVP テスト回答】',
      `テスターID：${data.testerId || '未指定'}`,
      `セッションID：${data.sessionId}`,
      `元シナリオ：${data.sourceScenario || '未検索'}`,
      `選んだ候補：${data.selectedTarget || 'なし'}`,
      `公開後の利用意向：${data.intent}`,
      `役立ち度：${data.usefulness}/5`,
      `調べたい候補：${data.actionable}`,
      `根拠リンクを開いた：${data.evidenceOpened ? 'はい' : 'いいえ'}`,
      `回答まで：約${data.secondsToFeedback || 0}秒`,
      `不足候補・情報：${data.missingCandidate || 'なし'}`,
      `コメント：${data.comment || 'なし'}`
    ].join('\n');
  }

  async function postFeedback(endpoint, feedback) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(feedback),
        keepalive: true
      });
      return response.type === 'opaque' || response.ok;
    } catch (error) {
      console.error('Feedback post failed', error);
      return false;
    }
  }

  function setPermalink(source) {
    const params = new URLSearchParams(location.search);
    params.set('scenario', source);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  }

  function getSessionId() {
    const key = 'cocContinuationSessionId';
    const createId = () => `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = createId();
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      return createId();
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        textarea.remove();
        return success;
      } catch {
        return false;
      }
    }
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
  }

  function cleanText(value, maxLength) {
    return String(value || '').replace(/[\r\t]/g, ' ').trim().slice(0, maxLength);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
