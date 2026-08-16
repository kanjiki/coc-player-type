(() => {
  'use strict';
  const DRAFT_KEY = 'cocContinuationEditorDraftV1';
  let data = null;
  let editingIndex = -1;
  const $ = id => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bind();
    try {
      if (!window.CONTINUATION_DATA_GZIP) throw new Error('公開データが見つかりません');
      data = await decodeGzipJson(window.CONTINUATION_DATA_GZIP);
      normalizeData();
      renderAll();
      newEdge();
    } catch (error) {
      console.error(error);
      toast('公開データを読み込めませんでした');
    }
  }

  function bind() {
    $('edgeFilter').addEventListener('input', renderEdgeList);
    $('newEdge').addEventListener('click', newEdge);
    $('saveEdge').addEventListener('click', saveEdge);
    $('duplicateEdge').addEventListener('click', duplicateEdge);
    $('deleteEdge').addEventListener('click', deleteEdge);
    $('addSource').addEventListener('click', addSource);
    $('downloadData').addEventListener('click', downloadData);
    $('showJson').addEventListener('click', showJson);
    $('closeJson').addEventListener('click', () => $('jsonModal').classList.add('hidden'));
    $('copyJson').addEventListener('click', async () => {
      await navigator.clipboard.writeText($('jsonText').value);
      toast('JSONをコピーしました');
    });
    $('restoreDraft').addEventListener('click', restoreDraft);
  }

  async function decodeGzipJson(base64) {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unsupported');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  async function gzipText(text) {
    if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unsupported');
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function normalizeData() {
    data.seed_scenarios ||= [];
    data.transitions ||= [];
    data.summary ||= {};
  }

  function renderAll() {
    rebuildAggregates();
    renderSources();
    renderEdgeList();
  }

  function renderSources() {
    const options = data.seed_scenarios
      .slice()
      .sort((a,b) => a.source_scenario.localeCompare(b.source_scenario, 'ja'))
      .map(seed => `<option value="${escapeAttr(seed.source_scenario)}">${escapeHtml(seed.source_scenario)}</option>`)
      .join('');
    $('sourceScenario').innerHTML = options;
  }

  function renderEdgeList() {
    const q = normalize($('edgeFilter').value);
    const rows = data.transitions.map((edge, index) => ({ edge, index }))
      .filter(({edge}) => !q || normalize(`${edge.source_scenario} ${edge.target_scenario} ${edge.reason}`).includes(q));
    $('edgeCount').textContent = `${rows.length} / ${data.transitions.length}件`;
    $('edgeList').innerHTML = rows.map(({edge,index}) => `
      <button type="button" class="edge-item${index === editingIndex ? ' active' : ''}" data-index="${index}">
        <b>${escapeHtml(edge.source_scenario)} → ${escapeHtml(edge.target_scenario)}</b>
        <span>${escapeHtml(edge.continuation_scope)}／${escapeHtml(edge.status)}／根拠${escapeHtml(edge.evidence_grade)}</span>
      </button>`).join('') || '<p class="help" style="padding:14px">一致する候補はありません。</p>';
    document.querySelectorAll('.edge-item[data-index]').forEach(button => button.addEventListener('click', () => editEdge(Number(button.dataset.index))));
  }

  function newEdge() {
    editingIndex = -1;
    $('editorMode').textContent = 'NEW EDGE';
    $('editorTitle').textContent = '継続先を追加';
    $('targetScenario').value = '';
    $('scope').value = '自陣全員';
    $('status').value = '推薦';
    $('grade').value = 'A';
    $('evidenceType').value = '完走報告';
    $('reason').value = '';
    $('evidenceUrl').value = '';
    $('granularity').value = 'status';
    $('verifiedOn').value = new Date().toISOString().slice(0,10);
    $('deleteEdge').classList.add('hidden');
    renderEdgeList();
  }

  function editEdge(index) {
    const edge = data.transitions[index];
    if (!edge) return;
    editingIndex = index;
    $('editorMode').textContent = edge.edge_id || `EDGE ${index + 1}`;
    $('editorTitle').textContent = `${edge.source_scenario} → ${edge.target_scenario}`;
    $('sourceScenario').value = edge.source_scenario;
    $('targetScenario').value = edge.target_scenario || '';
    $('scope').value = edge.continuation_scope || '指定なし';
    $('status').value = edge.status || '推薦';
    $('grade').value = edge.evidence_grade || 'B';
    $('evidenceType').value = edge.evidence_type || '';
    $('reason').value = edge.reason || '';
    $('evidenceUrl').value = edge.evidence_url || '';
    $('granularity').value = edge.link_granularity || 'status';
    $('verifiedOn').value = edge.verified_on || '';
    $('deleteEdge').classList.remove('hidden');
    renderEdgeList();
  }

  function formEdge() {
    return {
      source_scenario: $('sourceScenario').value,
      source_alias: primaryAlias($('sourceScenario').value),
      target_scenario: $('targetScenario').value.trim(),
      continuation_scope: $('scope').value,
      evidence_grade: $('grade').value,
      evidence_type: $('evidenceType').value.trim(),
      status: $('status').value,
      reason: $('reason').value.trim(),
      evidence_url: $('evidenceUrl').value.trim(),
      verified_on: $('verifiedOn').value.trim(),
      edge_id: editingIndex >= 0 ? data.transitions[editingIndex].edge_id : nextEdgeId(),
      link_granularity: $('granularity').value,
      human_review: '確認済み'
    };
  }

  function saveEdge() {
    const edge = formEdge();
    if (!edge.source_scenario || !edge.target_scenario || !edge.reason || !/^https?:\/\//.test(edge.evidence_url)) {
      toast('元・継続先・理由・正しい根拠URLを入力してください');
      return;
    }
    if (editingIndex >= 0) data.transitions[editingIndex] = edge;
    else {
      data.transitions.push(edge);
      editingIndex = data.transitions.length - 1;
    }
    rebuildAggregates();
    saveDraft();
    renderAll();
    editEdge(editingIndex);
    toast('下書きに保存しました');
  }

  function duplicateEdge() {
    if (editingIndex < 0) return toast('複製する候補を一覧から選んでください');
    const copy = structuredClone(data.transitions[editingIndex]);
    copy.edge_id = nextEdgeId();
    copy.target_scenario = `${copy.target_scenario}（複製）`;
    data.transitions.push(copy);
    editingIndex = data.transitions.length - 1;
    rebuildAggregates(); saveDraft(); renderAll(); editEdge(editingIndex);
    toast('複製しました。内容を修正してください');
  }

  function deleteEdge() {
    if (editingIndex < 0) return;
    const edge = data.transitions[editingIndex];
    if (!confirm(`「${edge.source_scenario} → ${edge.target_scenario}」を削除しますか？`)) return;
    data.transitions.splice(editingIndex, 1);
    editingIndex = -1;
    rebuildAggregates(); saveDraft(); renderAll(); newEdge();
    toast('削除しました');
  }

  function addSource() {
    const source = $('newSource').value.trim();
    const aliases = $('newAliases').value.split(/[,、]/).map(v => v.trim()).filter(Boolean);
    if (!source) return toast('正式名称を入力してください');
    if (data.seed_scenarios.some(seed => normalize(seed.source_scenario) === normalize(source))) return toast('すでに登録されています');
    data.seed_scenarios.push({
      seed_no: data.seed_scenarios.length + 1,
      source_scenario: source,
      aliases: [...new Set([source, ...aliases])],
      transition_count: 0,
      recommendation_count: 0,
      caution_count: 0,
      evidence_counts: {S:0,A:0,B:0,C:0},
      selection_basis: '管理画面から追加。根拠は各遷移を参照',
      dataset_status: 'MVP確認済み'
    });
    $('newSource').value = ''; $('newAliases').value = '';
    rebuildAggregates(); saveDraft(); renderAll();
    $('sourceScenario').value = source;
    toast('元シナリオを追加しました');
  }

  function rebuildAggregates() {
    data.seed_scenarios.forEach((seed, i) => {
      seed.seed_no = i + 1;
      const edges = data.transitions.filter(edge => edge.source_scenario === seed.source_scenario);
      seed.transition_count = edges.length;
      seed.recommendation_count = edges.filter(edge => edge.status === '推薦').length;
      seed.caution_count = edges.filter(edge => edge.status === '注意').length;
      seed.evidence_counts = {S:0,A:0,B:0,C:0};
      edges.forEach(edge => { if (edge.evidence_grade in seed.evidence_counts) seed.evidence_counts[edge.evidence_grade]++; });
    });
    data.summary.seed_scenarios = data.seed_scenarios.length;
    data.summary.transition_edges = data.transitions.length;
    data.summary.unique_targets = new Set(data.transitions.map(edge => edge.target_scenario)).size;
    data.summary.recommendations = data.transitions.filter(edge => edge.status === '推薦').length;
    data.summary.cautions = data.transitions.filter(edge => edge.status === '注意').length;
    data.summary.direct_status_links = data.transitions.filter(edge => edge.link_granularity === 'status').length;
    data.summary.aggregate_or_search_links = data.transitions.length - data.summary.direct_status_links;
    data.generated_at = new Date().toISOString();
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); $('editStatus').textContent = `下書き自動保存：${new Date().toLocaleTimeString('ja-JP')}`; } catch {}
  }

  function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return toast('保存済みの下書きはありません');
    if (!confirm('公開中のデータではなく、ブラウザに保存した下書きを復元しますか？')) return;
    try { data = JSON.parse(raw); normalizeData(); renderAll(); newEdge(); toast('下書きを復元しました'); }
    catch { toast('下書きの復元に失敗しました'); }
  }

  async function downloadData() {
    rebuildAggregates();
    try {
      const json = JSON.stringify(data);
      const compressed = await gzipText(json);
      const base64 = bytesToBase64(compressed);
      const source = `window.CONTINUATION_DATA_GZIP='${base64}';\n`;
      const blob = new Blob([source], {type:'text/javascript;charset=utf-8'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = 'data-gzip.js'; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast('data-gzip.jsをダウンロードしました');
    } catch (error) {
      console.error(error);
      toast('公開データの生成に失敗しました');
    }
  }

  function showJson() {
    rebuildAggregates();
    $('jsonText').value = JSON.stringify(data, null, 2);
    $('jsonModal').classList.remove('hidden');
  }

  function primaryAlias(source) {
    const seed = data.seed_scenarios.find(seed => seed.source_scenario === source);
    return seed?.aliases?.find(alias => alias !== source) || source;
  }

  function nextEdgeId() {
    const max = data.transitions.reduce((m, edge) => Math.max(m, Number(String(edge.edge_id || '').replace(/\D/g,'')) || 0), 0);
    return `E${String(max + 1).padStart(3,'0')}`;
  }

  function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s　・!！?？「」『』（）()_\-―—]/g,''); }
  function toast(message) { const e=$('toast'); e.textContent=message; e.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>e.classList.remove('show'),2600); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function escapeAttr(value) { return escapeHtml(value); }
})();
