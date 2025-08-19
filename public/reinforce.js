/**
 * Recoge de forma asíncrona todos los ejercicios que incluyan
 * alguna de las palabras/frases/conectores de `toReinforce`,
 * sin importar el módulo o nivel en que estén.
 */
async function collectGlobalReinforcementExercises(toReinforce) {
    const modules   = ['vocabulary','phrases','structures','conectors','tenses'];
    const reinforced = [];
  
    // Para cada módulo y cada nivel...
    for (const mod of modules) {
      for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
        try {
          const res  = await fetch(`/api/${mod}/levels/${lvl}`);
          if (!res.ok) continue;
          const items = await res.json();
          // Filtrar los items cuyo 'key' esté en toReinforce
          items.forEach(item => {
            const ex      = item.exercises[0];
            const key     = item.word
                         || item.phrase
                         || item.sentence
                         || item.connector
                         || ex.correct;
            if (toReinforce.includes(key)) {
              reinforced.push(item);
            }
          });
        } catch (e) {
          // ignora módulos/niveles faltantes
        }
      }
    }
  
    // Barajar el conjunto de refuerzo usando RNG con semilla si existe
    const rng = (window.seededRandom || Math.random);
    for (let i = reinforced.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [reinforced[i], reinforced[j]] = [reinforced[j], reinforced[i]];
    }
    return reinforced;
  }
  
  /**
   * Arranca el módulo de refuerzo **global** usando la función anterior.
   * Reemplaza a tu antigua startReinforcement().
   */
  async function startGlobalReinforcement() {
    // Ocultar elementos del home antes de iniciar
    try {
      document.getElementById('category-selection').style.display = 'none';
      const extra = document.getElementById('extra-cards');
      if (extra) extra.style.display = 'none';
      document.getElementById('menu-actions').style.display = 'none';
      document.getElementById('stats-container').style.display = 'none';
      document.getElementById('error-list').style.display = 'none';
    } catch(_) {}
    // 1) calcula las claves a reforzar de tu progreso acumulado
    const counts = progressData.wordsToReview.reduce((m,w) => {
      m[w] = (m[w]||0) + 1;
      return m;
    }, {});
    const toReinforce = Object.entries(counts)
      .filter(([,c]) => c >= REFORCE_THRESHOLD)
      .map(([w]) => w);
  
    // 2) recoge todos los ejercicios que contengan esas claves
    const reinforcedItems = await collectGlobalReinforcementExercises(toReinforce);
  
    if (reinforcedItems.length === 0) {
      if (window.showAlert) window.showAlert('No hay ejercicios de refuerzo disponibles para tus palabras.');
      else alert('No hay ejercicios de refuerzo disponibles para tus palabras.');
      return goHome(true);
    }
  
    // 3) inicializa el mini‑módulo de refuerzo
    currentData              = reinforcedItems;
    progressData.lastTotal   = reinforcedItems.length;
    // ténlo en cuenta: NO reseteamos `wordsToReview` ni `wordStats`
    categorySel.style.display = 'none';
    statsEl.style.display    = 'none';
    errorListEl.style.display = 'none';
    // Mostrar barra superior con botón de volver
    levelMenu.style.display  = 'flex';
    document.getElementById('level-display').textContent = 'Refuerzo';
    const menuButton = document.getElementById('menu-btn');
    if (menuButton) menuButton.textContent = 'Volver al menú';
    exerciseEl.style.display = 'block';
  
    // 4) arranca las preguntas sobre ese subconjunto
    renderQuestion(0);
  }

  /**
   * Dado un array de palabras únicas, busca ejercicios que contengan
   * esas palabras como clave (word/phrase/sentence/connector o correct).
   * Escanea todos los módulos y niveles disponibles.
   * Devuelve { foundItems, missingWords }.
   */
  async function findExercisesForWords(uniqueWords) {
    const modules   = ['vocabulary','phrases','structures','conectors','tenses'];
    const foundItems = [];
    const foundKeys  = new Set();

    for (const mod of modules) {
      for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
        try {
          const res  = await fetch(`/api/${mod}/levels/${lvl}`);
          if (!res.ok) continue;
          const items = await res.json();
          items.forEach(item => {
            const ex  = item.exercises && item.exercises[0];
            const key = item.word || item.phrase || item.connector || item.sentence; // no fallback a ex.correct
            if (!key && !Array.isArray(item.exercises)) return;
            // match por clave directa
            if (key && uniqueWords.includes(key)) {
              foundItems.push(item);
              foundKeys.add((key||'').toLowerCase());
              return;
            }
            // match por targets.words en ejercicios
            const targetWords = new Set();
            (item.exercises||[]).forEach(e => {
              (e?.targets?.words||[]).forEach(w => targetWords.add((w||'').toLowerCase()));
            });
            for (const w of uniqueWords) {
              const lw = (w||'').toLowerCase();
              if (targetWords.has(lw)) {
                foundItems.push(item);
                foundKeys.add(lw);
                break;
              }
            }
          });
        } catch(_) {/* ignore */}
      }
    }

    const missingWords = uniqueWords.filter(w => !foundKeys.has((w||'').toLowerCase()));
    return { foundItems, missingWords };
  }

  /**
   * Busca información por palabra: traducciones sugeridas (si existen en el dataset)
   * y el primer item de ejemplo encontrado por módulo/nivel.
   * Devuelve un mapa: { [word]: { translations: string[], examples: any[] } }
   */
  async function lookupWordInfos(words) {
    const target = new Set(words.map(w => (w || '').toLowerCase()))
    const modules   = ['vocabulary','phrases','structures','conectors','tenses'];
    const infoMap = {};

    function upsertInfo(key, item) {
      const lower = (key || '').toLowerCase();
      if (!lower) return;
      if (!infoMap[lower]) {
        infoMap[lower] = { translations: [], examples: [] };
      }
      // traducciones por campo directo
      if (Array.isArray(item.translations)) {
        item.translations.forEach(t => {
          if (t && !infoMap[lower].translations.includes(t)) {
            infoMap[lower].translations.push(t);
          }
        });
      }
      // traducciones desde ejercicios de tipo translate
      if (Array.isArray(item.exercises)) {
        item.exercises.forEach(ex => {
          if (ex && ex.type === 'translate' && ex.correct) {
            if (!infoMap[lower].translations.includes(ex.correct)) {
              infoMap[lower].translations.push(ex.correct);
            }
          }
        });
      }
      // guardar un ejemplo (limitado)
      if (infoMap[lower].examples.length < 3) {
        infoMap[lower].examples.push(item);
      }
    }

    for (const mod of modules) {
      for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
        try {
          const res  = await fetch(`/api/${mod}/levels/${lvl}`);
          if (!res.ok) continue;
          const items = await res.json();
          items.forEach(item => {
            const ex  = item.exercises && item.exercises[0];
            const key = item.word || item.phrase || item.connector || item.sentence; // sin fallback a correct
            const lowerKey = (key || '').toLowerCase();
            if (lowerKey && target.has(lowerKey)) {
              upsertInfo(lowerKey, item);
            }
            // También asociar por targets.words en ejercicios
            (item.exercises||[]).forEach(e => {
              (e?.targets?.words||[]).forEach(w => {
                const lw = (w||'').toLowerCase();
                if (lw && target.has(lw)) upsertInfo(lw, item);
              });
            });
          });
        } catch(_) {/* ignore */}
      }
    }

    return infoMap;
  }

  window.lookupWordInfos = lookupWordInfos;

  /** Carga listas CEFR { a1: string[], a2: string[], b1: string[], b2: string[] } */
  async function loadCEFRWordlists() {
    async function tryFetch(path) {
      try { const r = await fetch(path); return r.ok ? r.json() : []; }
      catch(_) { return []; }
    }
    const [a1Raw,a2Raw,b1Raw,b2Raw] = await Promise.all([
      tryFetch('/data/wordlists/cefr/a1.json'),
      tryFetch('/data/wordlists/cefr/a2.json'),
      tryFetch('/data/wordlists/cefr/b1.json'),
      tryFetch('/data/wordlists/cefr/b2.json')
    ]);
    // Normaliza a minúsculas y elimina duplicados por lista
    const normalizeUnique = (list) => {
      const seen = new Set();
      const out = [];
      (Array.isArray(list) ? list : []).forEach(w => {
        const k = (w || '').toLowerCase().trim();
        if (!k) return;
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      });
      return out;
    };
    // Deduplicar también ENTRE niveles, priorizando el nivel más bajo
    const a1 = normalizeUnique(a1Raw);
    const claimed = new Set(a1);
    const a2 = normalizeUnique(a2Raw).filter(w => !claimed.has(w));
    a2.forEach(w => claimed.add(w));
    const b1 = normalizeUnique(b1Raw).filter(w => !claimed.has(w));
    b1.forEach(w => claimed.add(w));
    const b2 = normalizeUnique(b2Raw).filter(w => !claimed.has(w));
    return { a1, a2, b1, b2 };
  }

  window.loadCEFRWordlists = loadCEFRWordlists;

  /**
   * Dado un item de entrada con posibles campos { word, phrase, sentence, connector, exercises, translations },
   * retorna su 'key' estándar y módulo sugerido.
   */
  function inferKeyAndModule(item) {
    const ex = item.exercises && item.exercises[0];
    // Priorizar connector sobre sentence; y usar connector como key cuando exista
    const key = item.word || item.phrase || item.connector || item.sentence || (ex && ex.correct);
    let mod = 'vocabulary';
    if (item.phrase) mod = 'phrases';
    else if (item.connector) mod = 'conectors';
    else if (item.sentence) mod = 'structures';
    else if (item.tense || (ex && /\(to .*\)/.test(ex?.question||''))) mod = 'tenses';
    return { key, mod };
  }

  window.inferKeyAndModule = inferKeyAndModule;

  /**
   * Construye un índice { keyLower: Set(modules) } recorriendo todos los módulos y niveles.
   */
  async function buildModulesIndex() {
    const modules = ['vocabulary','phrases','structures','conectors','tenses'];
    const index = {};
    for (const mod of modules) {
      for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
        try {
          const res  = await fetch(`/api/${mod}/levels/${lvl}`);
          if (!res.ok) continue;
          const items = await res.json();
          items.forEach(item => {
            const ex  = item.exercises && item.exercises[0];
            const key = item.word || item.phrase || item.connector || item.sentence; // sin fallback a correct
            const lower = (key||'').toLowerCase();
            if (lower) (index[lower] ||= new Set()).add(mod);
            // incluir también targets.words
            (item.exercises||[]).forEach(e => {
              (e?.targets?.words||[]).forEach(w => {
                const lw = (w||'').toLowerCase();
                if (!lw) return;
                (index[lw] ||= new Set()).add(mod);
              });
            });
          });
        } catch(_) {/* ignore */}
      }
    }
    return index;
  }

  /**
   * Dado un array de palabras (lower/upper indiferente), devuelve cobertura por módulo por palabra.
   * { wordLower: { modules: {vocabulary:boolean, phrases:boolean, structures:boolean, conectors:boolean, tenses:boolean} } }
   */
  async function getCoverageForWords(words) {
    const modules = ['vocabulary','phrases','structures','conectors','tenses'];
    const target = words.map(w => (w||'').toLowerCase());
    const idx = await buildModulesIndex();
    const result = {};
    target.forEach(w => {
      const present = idx[w] || new Set();
      const obj = { modules: {} };
      modules.forEach(m => { obj.modules[m] = present.has(m); });
      result[w] = obj;
    });
    return result;
  }

  window.getCoverageForWords = getCoverageForWords;
  // Exponer para script.js
  window.findExercisesForWords = findExercisesForWords;
  window.loadCEFRWordlists = loadCEFRWordlists;
  window.lookupWordInfos = lookupWordInfos;
  