(() => {
  'use strict';

  // ---- 数据 ----
  const DATA = window.VOCAB_QUIZ || { lessons: [], words: [] };
  const WORDS = DATA.words || [];
  const LESSONS = DATA.lessons || [];
  // de -> word 索引（错词本按 de 存，需反查词条）
  const WORD_BY_DE = new Map(WORDS.map((w) => [w.de, w]));

  // 题型定义：key -> {label, pos(适用词性), build(word)->question|null}
  // question: {type, prompt, promptSub, answer, options?, inputHint?, accept?(str)->bool}
  const POS_LABEL = { noun: '名词', verb: '动词', adjective: '形容词', other: '其他' };
  const PERSON_ORDER = ['ich', 'du', 'er_sie_es', 'wir', 'ihr', 'sie_Sie'];
  const PERSON_LABEL = {
    ich: 'ich', du: 'du', er_sie_es: 'er/sie/es', wir: 'wir', ihr: 'ihr', sie_Sie: 'sie/Sie',
  };

  // ---- 工具 ----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // 严格比对：仅归一化首尾空格与内部多空格，大小写、变音符必须完全一致。
  function strictEq(a, b) {
    const clean = (s) => (s || '').trim().replace(/\s+/g, ' ');
    return clean(a) === clean(b);
  }

  // ---- 题型引擎 ----
  // 名词·阴阳性
  function qNounGender(w) {
    if (w.category !== 'noun' || !w.article) return null;
    return {
      type: 'nounGender', word: w,
      prompt: w.headword ? w.headword.replace(/^(der|die|das)\s+/, '') : w.de,
      promptSub: '选择正确的冠词', answer: w.article,
      options: ['der', 'die', 'das'], responseType: 'select',
    };
  }
  // 名词·复数拼写
  function qNounPlural(w) {
    if (w.category !== 'noun' || !w.plural) return null;
    const singular = w.headword || w.de;
    return {
      type: 'nounPlural', word: w,
      prompt: singular, promptSub: '写出复数形式（含冠词 die）',
      answer: w.plural, responseType: 'text',
      inputHint: 'die …',
      accept: (v) => strictEq(v, w.plural) || strictEq(v, 'die ' + w.plural),
    };
  }
  // 动词·人称变位填空（随机一个人称）
  function qVerbConjugation(w) {
    if (w.category !== 'verb' || !w.present) return null;
    const persons = PERSON_ORDER.filter((p) => w.present[p]);
    if (!persons.length) return null;
    const p = pick(persons);
    return {
      type: 'verbConjugation', word: w,
      prompt: `${PERSON_LABEL[p]} ____`, promptSub: `${w.headword} · 现在时变位`,
      answer: w.present[p], responseType: 'text', inputHint: '动词形式',
      accept: (v) => strictEq(v, w.present[p]),
    };
  }
  // 动词·完成时填空
  function qVerbPerfekt(w) {
    if (w.category !== 'verb' || !w.perfect) return null;
    return {
      type: 'verbPerfekt', word: w,
      prompt: `er/sie/es ____`, promptSub: `${w.headword} · 完成时（助动词 + 过去分词）`,
      answer: w.perfect, responseType: 'text', inputHint: 'hat/ist …',
      accept: (v) => strictEq(v, w.perfect),
    };
  }
  // 动词·过去式填空
  function qVerbPraeteritum(w) {
    if (w.category !== 'verb' || !w.preterite) return null;
    return {
      type: 'verbPraeteritum', word: w,
      prompt: `er/sie/es ____`, promptSub: `${w.headword} · 过去式`,
      answer: w.preterite, responseType: 'text', inputHint: '过去式',
      accept: (v) => strictEq(v, w.preterite),
    };
  }
  // 形容词·比较级+最高级填空
  function qAdjCompare(w) {
    if (w.category !== 'adjective' || !w.comparative || !w.superlative) return null;
    return {
      type: 'adjCompare', word: w,
      prompt: w.positive || w.de, promptSub: '写出比较级和最高级（用逗号分隔）',
      answer: `${w.comparative}, ${w.superlative}`, responseType: 'text',
      inputHint: '比较级, 最高级',
      accept: (v) => {
        const parts = v.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        return parts.length === 2 &&
          strictEq(parts[0], w.comparative) &&
          strictEq(parts[1], w.superlative);
      },
    };
  }
  // 词义选择（看德选义 / 看义选德，随机方向；义用英文，预留中文）
  function qMeaning(w, allWords) {
    const gloss = w.en || w.zh;
    if (!gloss) return null;
    const useZh = !w.en && w.zh; // 有中文无英文时用中文
    const glossKey = useZh ? 'zh' : 'en';
    const deToGloss = Math.random() < 0.5;
    // 干扰项：同词性优先，取不同释义
    const pool = allWords.filter((x) => x !== w && (x[glossKey] || '').trim() &&
      x[glossKey] !== w[glossKey]);
    const sameCat = pool.filter((x) => x.category === w.category);
    const distractPool = sameCat.length >= 3 ? sameCat : pool;
    const distractors = shuffle(distractPool).slice(0, 3);
    const deLabel = w.headword || w.de;
    if (deToGloss) {
      const opts = shuffle([w, ...distractors]).map((x) => x[glossKey]);
      return {
        type: 'meaning', word: w,
        prompt: deLabel, promptSub: useZh ? '选择正确的中文释义' : '选择正确的英文释义',
        answer: w[glossKey], options: opts, responseType: 'select',
      };
    }
    const opts = shuffle([w, ...distractors]).map((x) => x.headword || x.de);
    return {
      type: 'meaning', word: w,
      prompt: gloss, promptSub: '选择对应的德语单词',
      answer: deLabel, options: opts, responseType: 'select',
    };
  }

  const QUESTION_TYPES = [
    { key: 'nounGender', label: '名词·阴阳性', pos: 'noun', build: qNounGender },
    { key: 'nounPlural', label: '名词·复数拼写', pos: 'noun', build: qNounPlural },
    { key: 'verbConjugation', label: '动词·人称变位', pos: 'verb', build: qVerbConjugation },
    { key: 'verbPerfekt', label: '动词·完成时', pos: 'verb', build: qVerbPerfekt },
    { key: 'verbPraeteritum', label: '动词·过去式', pos: 'verb', build: qVerbPraeteritum },
    { key: 'adjCompare', label: '形容词·比较级/最高级', pos: 'adjective', build: qAdjCompare },
    { key: 'meaning', label: '词义选择（德⇄英）', pos: '*', build: qMeaning },
  ];

  // ---- 错题记忆（localStorage）----
  const MISTAKE_KEY = 'vocabQuiz.mistakes.v1';
  function loadMistakes() {
    try { return JSON.parse(localStorage.getItem(MISTAKE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveMistakes(m) {
    try { localStorage.setItem(MISTAKE_KEY, JSON.stringify(m)); } catch {}
  }
  // 记录：key=de，值={wrong,right}。答错 wrong++，答对 right++。
  function recordResult(word, ok) {
    const m = loadMistakes();
    const k = word.de;
    const e = m[k] || { wrong: 0, right: 0 };
    if (ok) e.right += 1; else e.wrong += 1;
    m[k] = e; saveMistakes(m);
  }
  // 净错次数（wrong-right，>0 表示还没掌握），用于优先出题排序
  function mistakeWeight(word) {
    const e = loadMistakes()[word.de];
    if (!e) return 0;
    return e.wrong - e.right;
  }
  // 错词本：返回 [{word, wrong, right, net}]，按净错降序（同净错按错次降序）。
  // mode='unmastered'：只看净错>0（答对追平后自动毕业）
  // mode='all'：所有错过的词（wrong>0），含已追平的
  function wordbookEntries(mode) {
    const m = loadMistakes();
    const rows = [];
    Object.keys(m).forEach((de) => {
      const w = WORD_BY_DE.get(de);
      if (!w) return; // 词库里已无此词（数据重建），跳过
      const { wrong, right } = m[de];
      const net = wrong - right;
      const keep = mode === 'all' ? wrong > 0 : net > 0;
      if (keep) rows.push({ word: w, wrong, right, net });
    });
    // 全部错过：按累计错次降序；未掌握：按净错降序
    if (mode === 'all') rows.sort((a, b) => (b.wrong - a.wrong) || (b.net - a.net));
    else rows.sort((a, b) => (b.net - a.net) || (b.wrong - a.wrong));
    return rows;
  }
  function clearMistakes() {
    try { localStorage.removeItem(MISTAKE_KEY); } catch {}
  }

  // ---- 练习历史（localStorage）----
  const HISTORY_KEY = 'vocabQuiz.history.v1';
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
  }
  // 存一次练习结果。record: {id, at, scope, total, correct, wrong:[{prompt,answer,given,type}]}
  function pushHistory(record) {
    const list = loadHistory();
    list.unshift(record); // 最新在前
    saveHistory(list);
  }
  function deleteHistory(id) {
    saveHistory(loadHistory().filter((r) => r.id !== id));
  }

  // ---- 状态 ----
  const state = {
    lessonSet: new Set(), // 空 = 全部
    posSet: new Set(['noun', 'verb', 'adjective', 'other']),
    typeSet: new Set(QUESTION_TYPES.map((t) => t.key)),
    count: 20, infinite: false,
    queue: [], index: 0, correct: 0, wrong: [], answered: false,
    total: 0, // 已答题数（无限模式下累计）
    scope: '', // 当次范围描述
    wordbookMode: 'unmastered', // 错词本筛选：unmastered(净错>0) / all(错过的全部)
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const setupEl = $('vq-setup');
  const quizEl = $('vq-quiz');
  const resultEl = $('vq-result');
  const detailEl = $('vq-detail');
  const wordbookEl = $('vq-wordbook');
  const stageEl = $('vq-stage');

  // 课程按 order 排序，四课一组
  function lessonGroups() {
    const sorted = LESSONS.slice().sort((a, b) => a.order - b.order);
    const groups = [];
    for (let i = 0; i < sorted.length; i += 4) {
      const items = sorted.slice(i, i + 4);
      groups.push({
        label: items.length > 1
          ? `第 ${items[0].order}-${items[items.length - 1].order} 课`
          : `第 ${items[0].order} 课`,
        items,
      });
    }
    return groups;
  }

  // ---- 初始化设置面板 ----
  function initSetup() {
    const lessonBox = $('vq-lessons');
    lessonGroups().forEach((g) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'vq-lesson-group';

      const head = document.createElement('label');
      head.className = 'vq-check vq-group-head';
      const gcb = document.createElement('input');
      gcb.type = 'checkbox'; gcb.checked = true; gcb.dataset.group = 'lessonGroup';
      const gspan = document.createElement('span');
      gspan.textContent = g.label;
      head.append(gcb, gspan);
      groupEl.appendChild(head);

      const items = document.createElement('div');
      items.className = 'vq-group-items';
      g.items.forEach((l) => {
        items.appendChild(makeCheck('lesson', l.id, `${l.order}. ${l.title}`, true));
        state.lessonSet.add(l.id);
      });
      groupEl.appendChild(items);
      lessonBox.appendChild(groupEl);
    });

    const posBox = $('vq-pos');
    ['noun', 'verb', 'adjective', 'other'].forEach((p) => {
      posBox.appendChild(makeCheck('pos', p, POS_LABEL[p], true));
    });
    const typeBox = $('vq-types');
    QUESTION_TYPES.forEach((t) => {
      const chk = makeCheck('type', t.key, t.label, true);
      chk.querySelector('input').dataset.pos = t.pos;
      typeBox.appendChild(chk);
    });

    lessonBox.addEventListener('change', syncLessons);
    $('vq-lesson-all').addEventListener('click', () => setAllLessons(true));
    $('vq-lesson-none').addEventListener('click', () => setAllLessons(false));
    posBox.addEventListener('change', syncPos);
    typeBox.addEventListener('change', syncTypes);
    $('vq-count').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      state.infinite = v === -1;
      state.count = state.infinite ? 0 : v;
    });
    $('vq-start').addEventListener('click', startQuiz);
    $('vq-quit').addEventListener('click', endQuiz);
    $('vq-again').addEventListener('click', backToSetup);
    $('vq-retry-wrong').addEventListener('click', retryWrong);
    $('vq-new').addEventListener('click', backToSetup);
    $('vq-detail-close').addEventListener('click', backToSetup);
    $('vq-wordbook-open').addEventListener('click', showWordbook);
    $('vq-wordbook-close').addEventListener('click', backToSetup);
    $('vq-wordbook-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.wordbookMode = btn.dataset.mode;
      renderWordbook();
    });
    $('vq-wordbook-practice').addEventListener('click', practiceWordbook);
    $('vq-wordbook-clear').addEventListener('click', () => {
      if (!confirm('确定清空错词本？将删除所有单词的对错记录。')) return;
      clearMistakes();
      showWordbook();
    });
    refreshAvail();
    renderHistory();
  }

  // ---- 历史列表与详情 ----
  function fmtTime(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function renderHistory() {
    const box = $('vq-history-list');
    const list = loadHistory();
    box.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'vq-history-empty';
      p.textContent = '还没有练习记录';
      box.appendChild(p);
      return;
    }
    list.forEach((rec) => {
      const rate = rec.total ? Math.round((rec.correct / rec.total) * 100) : 0;
      const item = document.createElement('div');
      item.className = 'vq-history-item';
      const main = document.createElement('button');
      main.type = 'button'; main.className = 'vq-history-main';
      main.innerHTML =
        `<span class="vq-history-time">${fmtTime(rec.at)}</span>` +
        `<span class="vq-history-scope">${escapeHtml(rec.scope || '')}</span>` +
        `<span class="vq-history-rate">${rate}% · ${rec.correct}/${rec.total}</span>`;
      main.addEventListener('click', () => showDetail(rec.id));
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'vq-history-del';
      del.title = '删除'; del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistory(rec.id);
        renderHistory();
        // 若正在看这条详情，关掉
        if (detailEl.dataset.id === rec.id) backToSetup();
      });
      item.append(main, del);
      box.appendChild(item);
    });
  }

  function showDetail(id) {
    const rec = loadHistory().find((r) => r.id === id);
    if (!rec) return;
    setupEl.hidden = true; quizEl.hidden = true; resultEl.hidden = true;
    detailEl.hidden = false; detailEl.dataset.id = id;
    const rate = rec.total ? Math.round((rec.correct / rec.total) * 100) : 0;
    $('vq-detail-title').textContent = fmtTime(rec.at) + ' 的练习';
    $('vq-detail-scope').textContent = rec.scope || '';
    $('vq-d-total').textContent = rec.total;
    $('vq-d-correct').textContent = rec.correct;
    $('vq-d-rate').textContent = rate + '%';
    renderWrongList($('vq-detail-wrong'), rec.wrong || []);
  }

  // ---- 错词本 ----
  function showWordbook() {
    setupEl.hidden = true; quizEl.hidden = true;
    resultEl.hidden = true; detailEl.hidden = true;
    wordbookEl.hidden = false;
    renderWordbook();
  }

  function renderWordbook() {
    const mode = state.wordbookMode;
    const rows = wordbookEntries(mode);
    // 过滤切换按钮高亮
    document.querySelectorAll('.vq-wordbook-filter button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mode === mode);
    });
    $('vq-wordbook-sub').textContent = rows.length
      ? (mode === 'all'
          ? `共 ${rows.length} 个错过的词（含已追平，按错误次数排序）`
          : `共 ${rows.length} 个还没掌握的词（按净错次数排序）`)
      : '';
    $('vq-wordbook-practice').disabled = rows.length === 0;
    const box = $('vq-wordbook-list');
    box.innerHTML = '';
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'vq-word-info';
      p.textContent = '错词本是空的，答错的词会出现在这里。';
      box.appendChild(p);
      return;
    }
    rows.forEach(({ word, wrong, right, net }) => {
      const row = document.createElement('div');
      row.className = 'vq-wordbook-row';
      const de = escapeHtml(word.headword || word.de);
      const gloss = escapeHtml(word.en || word.zh || '');
      row.innerHTML =
        `<div class="vq-wordbook-word"><span class="vq-wordbook-de">${de}</span>` +
        (gloss ? `<span class="vq-wordbook-gloss">${gloss}</span>` : '') + `</div>` +
        `<span class="vq-wordbook-stat">净错 ${net} · 错 ${wrong}/对 ${right}</span>`;
      box.appendChild(row);
    });
  }

  // 用错词本里的词开一局：仅出这些词的题，按净错优先
  function practiceWordbook() {
    const rows = wordbookEntries(state.wordbookMode);
    if (!rows.length) return;
    const scope = rows.map((r) => r.word);
    const activeTypes = QUESTION_TYPES.filter((t) => state.typeSet.has(t.key));
    const pool = [];
    scope.forEach((w) => {
      activeTypes.forEach((t) => {
        if (t.pos !== '*' && t.pos !== w.category) return;
        const q = t.build(w, scope);
        if (q) pool.push(q);
      });
    });
    if (!pool.length) { alert('当前题型下，这些词暂时出不了题。'); return; }
    state.queue = orderPool(pool); state.index = 0; state.correct = 0;
    state.wrong = []; state.answered = false; state.total = 0;
    state.infinite = false; state.scope = '错词本练习';
    wordbookEl.hidden = true; setupEl.hidden = true; resultEl.hidden = true;
    quizEl.hidden = false;
    renderQuestion();
  }

  function syncLessons(e) {
    const grp = e.target.dataset.group;
    if (grp === 'lessonGroup') {
      // 组标题：联动组内所有课
      const groupEl = e.target.closest('.vq-lesson-group');
      const on = e.target.checked;
      groupEl.querySelectorAll('input[data-group=lesson]').forEach((cb) => {
        cb.checked = on;
        if (on) state.lessonSet.add(cb.value);
        else state.lessonSet.delete(cb.value);
      });
      e.target.indeterminate = false;
      refreshAvail();
      return;
    }
    if (grp !== 'lesson') return;
    if (e.target.checked) state.lessonSet.add(e.target.value);
    else state.lessonSet.delete(e.target.value);
    syncGroupHead(e.target.closest('.vq-lesson-group'));
    refreshAvail();
  }

  // 根据组内课的勾选状态，更新组标题为 全选/半选/全不选
  function syncGroupHead(groupEl) {
    if (!groupEl) return;
    const head = groupEl.querySelector('input[data-group=lessonGroup]');
    const items = Array.from(groupEl.querySelectorAll('input[data-group=lesson]'));
    const checked = items.filter((cb) => cb.checked).length;
    head.checked = checked === items.length;
    head.indeterminate = checked > 0 && checked < items.length;
  }

  function setAllLessons(on) {
    state.lessonSet.clear();
    $('vq-lessons').querySelectorAll('input[data-group=lesson]').forEach((cb) => {
      cb.checked = on;
      if (on) state.lessonSet.add(cb.value);
    });
    $('vq-lessons').querySelectorAll('input[data-group=lessonGroup]').forEach((cb) => {
      cb.checked = on; cb.indeterminate = false;
    });
    refreshAvail();
  }

  function makeCheck(group, value, label, checked) {
    const wrap = document.createElement('label');
    wrap.className = 'vq-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = value; cb.checked = checked;
    cb.dataset.group = group;
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(cb, span);
    return wrap;
  }
  function syncPos(e) {
    if (e.target.checked) state.posSet.add(e.target.value);
    else state.posSet.delete(e.target.value);
    applyPosTypeLink();
    refreshAvail();
  }

  // 词性驱动题型：某词性未选，其专属题型置灰并取消；词义题(pos=*)始终可用。
  function applyPosTypeLink() {
    $('vq-types').querySelectorAll('input[data-group=type]').forEach((cb) => {
      const pos = cb.dataset.pos;
      const wrap = cb.closest('.vq-check');
      if (pos === '*') return; // 词义题不受词性影响
      const enabled = state.posSet.has(pos);
      cb.disabled = !enabled;
      if (wrap) wrap.classList.toggle('is-disabled', !enabled);
      if (!enabled) {
        cb.checked = false;
        state.typeSet.delete(cb.value);
      } else if (!cb.checked) {
        cb.checked = true;
        state.typeSet.add(cb.value);
      }
    });
  }
  function syncTypes(e) {
    if (e.target.checked) state.typeSet.add(e.target.value);
    else state.typeSet.delete(e.target.value);
    refreshAvail();
  }

  // 按当前范围筛词
  function wordsInScope() {
    return WORDS.filter((w) => {
      if (!state.lessonSet.has(w.lessonId)) return false;
      if (!state.posSet.has(w.category)) return false;
      return true;
    });
  }

  // 生成候选题目池（词 × 适用题型）
  function buildPool() {
    const scope = wordsInScope();
    const activeTypes = QUESTION_TYPES.filter((t) => state.typeSet.has(t.key));
    const pool = [];
    scope.forEach((w) => {
      activeTypes.forEach((t) => {
        if (t.pos !== '*' && t.pos !== w.category) return;
        const q = t.build(w, scope);
        if (q) pool.push(q);
      });
    });
    return pool;
  }

  function refreshAvail() {
    const n = buildPool().length;
    $('vq-avail').textContent = `当前范围可出 ${n} 道题`;
    $('vq-start').disabled = n === 0;
  }

  // ---- 开始练习 ----
  // 出题排序：错得多的词优先（mistakeWeight 降序），同权重内随机。
  function orderPool(pool) {
    return pool
      .map((q) => ({ q, w: mistakeWeight(q.word), r: Math.random() }))
      .sort((a, b) => (b.w - a.w) || (a.r - b.r))
      .map((x) => x.q);
  }

  // 当次范围的简短描述，存入历史用
  function scopeDescription() {
    const total = LESSONS.length;
    const nL = state.lessonSet.size;
    const lessonPart = nL === total ? '全部课程' : `${nL} 课`;
    const posNames = ['noun', 'verb', 'adjective', 'other']
      .filter((p) => state.posSet.has(p)).map((p) => POS_LABEL[p]);
    const posPart = posNames.length === 4 ? '全词性' : posNames.join('/');
    const mode = state.infinite ? '无限循环' : (state.count > 0 ? `${state.count} 题` : '全部');
    return `${lessonPart} · ${posPart} · ${mode}`;
  }

  function startQuiz() {
    const base = buildPool();
    if (!base.length) return;
    let queue;
    if (state.infinite) {
      queue = orderPool(base); // 无限模式先按错题优先排一轮，用完再补
    } else {
      queue = orderPool(base);
      if (state.count > 0) queue = queue.slice(0, state.count);
    }
    state.queue = queue; state.index = 0; state.correct = 0;
    state.wrong = []; state.answered = false; state.total = 0;
    state.scope = scopeDescription();
    setupEl.hidden = true; resultEl.hidden = true; quizEl.hidden = false;
    renderQuestion();
  }

  function backToSetup() {
    quizEl.hidden = true; resultEl.hidden = true;
    detailEl.hidden = true; detailEl.dataset.id = '';
    wordbookEl.hidden = true;
    setupEl.hidden = false;
    refreshAvail();
  }

  function endQuiz() {
    // 一题都没答就直接回设置页；否则结算（无限模式靠 total 判断，不能看 index）
    if (state.total === 0) { backToSetup(); return; }
    showResult();
  }

  // ---- 渲染题目 ----
  function renderQuestion() {
    const q = state.queue[state.index];
    state.answered = false;
    $('vq-progress').textContent = state.infinite
      ? `已答 ${state.total} · 循环中`
      : `${state.index + 1} / ${state.queue.length}`;
    $('vq-score').textContent = `正确 ${state.correct}`;

    const card = document.createElement('div');
    card.className = 'vq-card';

    const badge = document.createElement('span');
    badge.className = 'vq-badge';
    badge.textContent = typeLabel(q.type);
    card.appendChild(badge);

    const prompt = document.createElement('div');
    prompt.className = 'vq-prompt';
    prompt.textContent = q.prompt;
    card.appendChild(prompt);

    if (q.promptSub) {
      const sub = document.createElement('div');
      sub.className = 'vq-prompt-sub';
      sub.textContent = q.promptSub;
      card.appendChild(sub);
    }

    if (q.word.audio) {
      const audioBtn = document.createElement('button');
      audioBtn.type = 'button'; audioBtn.className = 'vq-audio';
      audioBtn.textContent = '🔊 发音';
      audioBtn.addEventListener('click', () => new Audio(q.word.audio).play().catch(() => {}));
      card.appendChild(audioBtn);
    }

    const answerBox = document.createElement('div');
    answerBox.className = 'vq-answer-box';
    card.appendChild(answerBox);

    if (q.responseType === 'select') {
      renderSelect(q, answerBox);
    } else {
      renderText(q, answerBox);
    }

    const feedback = document.createElement('div');
    feedback.className = 'vq-feedback'; feedback.id = 'vq-feedback';
    card.appendChild(feedback);

    stageEl.innerHTML = '';
    stageEl.appendChild(card);
  }

  function typeLabel(type) {
    const t = QUESTION_TYPES.find((x) => x.key === type);
    return t ? t.label : type;
  }

  // 选择题
  function renderSelect(q, box) {
    q.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'vq-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        if (state.answered) return;
        grade(q, opt === q.answer, opt, box);
      });
      box.appendChild(btn);
    });
  }

  // 填空题
  function renderText(q, box) {
    const form = document.createElement('form');
    form.className = 'vq-text-form';
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'vq-input';
    input.placeholder = q.inputHint || ''; input.autocomplete = 'off';
    input.autocapitalize = 'off'; input.spellcheck = false;
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.className = 'vq-primary'; submit.textContent = '提交';
    form.append(input, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.answered) { next(); return; }
      const val = input.value.trim();
      if (!val) return;
      const ok = q.accept ? q.accept(val) : strictEq(val, q.answer);
      grade(q, ok, val, box);
    });
    box.appendChild(form);
    input.focus();
  }

  // ---- 判分 ----
  function grade(q, ok, given, box) {
    state.answered = true;
    state.total += 1;
    recordResult(q.word, ok);
    const fb = $('vq-feedback');
    if (ok) {
      state.correct += 1;
      fb.className = 'vq-feedback is-correct';
      fb.textContent = '✓ 正确';
    } else {
      state.wrong.push({ q, given });
      fb.className = 'vq-feedback is-wrong';
      // 阴阳性题：正确答案里的冠词按性别配色
      const ansHtml = q.type === 'nounGender'
        ? `<strong class="vq-gender-${q.answer}">${escapeHtml(q.answer)}</strong>`
        : `<strong>${escapeHtml(q.answer)}</strong>`;
      fb.innerHTML = `✗ 正确答案：${ansHtml}`;
    }
    // 阴阳性题：题干单词按冠词配色（对错都染，强化词与性别颜色的关联）
    if (q.type === 'nounGender') {
      const promptEl = stageEl.querySelector('.vq-prompt');
      if (promptEl) promptEl.classList.add('vq-gender-' + q.answer);
    }
    // 选择题：标记对错
    if (q.responseType === 'select') {
      box.querySelectorAll('.vq-option').forEach((btn) => {
        btn.disabled = true;
        if (btn.textContent === q.answer) {
          btn.classList.add('is-correct');
        } else if (btn.textContent === given && !ok) {
          btn.classList.add('is-wrong');
        }
      });
    } else {
      const input = box.querySelector('.vq-input');
      if (input) input.disabled = true;
      const submit = box.querySelector('button[type=submit]');
      if (submit) submit.textContent = '下一题';
    }
    $('vq-score').textContent = `正确 ${state.correct}`;
    // 揭晓答案时播放一次单词录音
    if (q.word.audio) { new Audio(q.word.audio).play().catch(() => {}); }
    // 词义附加信息
    appendWordInfo(q);
    // 选择题自动可进入下一题
    if (q.responseType === 'select') {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button'; nextBtn.className = 'vq-primary vq-next';
      nextBtn.textContent = (!state.infinite && state.index + 1 >= state.queue.length)
        ? '查看结果' : '下一题';
      nextBtn.addEventListener('click', next);
      $('vq-feedback').appendChild(nextBtn);
      nextBtn.focus();
    }
  }

  function appendWordInfo(q) {
    const w = q.word;
    const info = document.createElement('div');
    info.className = 'vq-word-info';
    const bits = [];
    if (w.headword && w.headword !== q.prompt) bits.push(w.headword);
    if (w.en) bits.push(w.en);
    if (w.zh) bits.push(w.zh);
    if (bits.length) { info.textContent = bits.join(' · '); $('vq-feedback').appendChild(info); }
  }

  function next() {
    state.index += 1;
    if (state.index >= state.queue.length) {
      if (state.infinite) {
        // 无限模式：重新按最新错题权重排一轮，继续
        state.queue = orderPool(buildPool());
        state.index = 0;
        if (!state.queue.length) { showResult(); return; }
        renderQuestion();
        return;
      }
      showResult();
      return;
    }
    renderQuestion();
  }

  // ---- 结算 ----
  function showResult() {
    quizEl.hidden = true; setupEl.hidden = true; resultEl.hidden = false;
    detailEl.hidden = true;
    const done = state.total;
    $('vq-r-total').textContent = done;
    $('vq-r-correct').textContent = state.correct;
    $('vq-r-rate').textContent = done ? Math.round((state.correct / done) * 100) + '%' : '0%';

    renderWrongList($('vq-wrong-list'), state.wrong.map((x) => ({
      prompt: x.q.prompt, answer: x.q.answer, given: x.given,
    })));
    $('vq-retry-wrong').hidden = state.wrong.length === 0;

    // 存入历史（仅一次，重练错题不再重复存）
    if (done > 0) {
      pushHistory({
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        at: new Date().toISOString(),
        scope: state.scope,
        total: done,
        correct: state.correct,
        wrong: state.wrong.map((x) => ({
          prompt: x.q.prompt, answer: x.q.answer, given: x.given,
        })),
      });
      renderHistory();
    }
  }

  // 通用错题列表渲染（结算页与详情页共用）
  function renderWrongList(container, wrongItems) {
    container.innerHTML = '';
    if (!wrongItems.length) {
      const p = document.createElement('p');
      p.className = 'vq-word-info'; p.textContent = '全部答对，没有错题。';
      container.appendChild(p);
      return;
    }
    const h = document.createElement('h3');
    h.textContent = `错题 ${wrongItems.length}`;
    container.appendChild(h);
    wrongItems.forEach(({ prompt, answer, given }) => {
      const row = document.createElement('div');
      row.className = 'vq-wrong-row';
      row.innerHTML = `<span class="vq-wrong-q">${escapeHtml(prompt)}</span>` +
        `<span class="vq-wrong-a">你的答案 <em>${escapeHtml(given)}</em> · ` +
        `正确 <strong>${escapeHtml(answer)}</strong></span>`;
      container.appendChild(row);
    });
  }

  function retryWrong() {
    const queue = shuffle(state.wrong.map((x) => x.q));
    if (!queue.length) return;
    state.queue = queue; state.index = 0; state.correct = 0;
    state.wrong = []; state.answered = false; state.total = 0;
    state.infinite = false; state.scope = '错题重练';
    resultEl.hidden = true; quizEl.hidden = false;
    renderQuestion();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---- 启动 ----
  function boot() {
    if (!WORDS.length) {
      setupEl.innerHTML = '<p class="vq-empty">词库数据未加载。请先运行 scripts/build_vocab_quiz.py 生成 data/vocab-quiz.js。</p>';
      return;
    }
    initSetup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
