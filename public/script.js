// script.js

// 1. Constantes de juego
const MAX_LEVEL        = 4;
const PASS_RATE        = 0.9;
const REFORCE_THRESHOLD= 2;
const KNOWN_THRESHOLD  = 0.8;  // 80% de acierto para "sabido"
const MIN_ATTEMPTS     = 3;    // mínimo intentos para evaluar "sabido"
const ERROR_BLOCK_SIZE = 10;   // tamaño del bloque de práctica de errores

// 2. Referencias al DOM
const titleEl       = document.getElementById('main-title');
const categorySel   = document.getElementById('category-selection');
const extraCards    = document.getElementById('extra-cards');
const levelMenu     = document.getElementById('level-menu-container');
const menuBtn       = document.getElementById('menu-btn');
const actionsEl     = document.getElementById('menu-actions');
const statsEl       = document.getElementById('stats-container');
const errorListEl   = document.getElementById('error-list');
const exerciseEl    = document.getElementById('exercise-container');
const textLessonEl  = document.getElementById('text-lesson-container');
const placementEl   = document.getElementById('placement-container');
const importEl      = document.getElementById('import-container');

// Imagen por categoría con varios intentos (sensible a mayúsculas)
function imageCandidatesForCategory(catId) {
  const base = '/data/pictures/';
  // Mapeo de nombres de archivo reales encontrados en /data/pictures
  const filenameById = {
    vocabulary: 'vocabulary',
    phrases: 'Phrases', // archivo con P mayúscula
    structures: 'structures',
    conectors: 'conectors', // cuidado con el typo
    tenses: 'tenses'
  };
  const name = filenameById[catId] || catId;
  return [
    `${base}${name}.png`,
    `${base}${name}.jpg`,
    `${base}${name}.webp`,
    `${base}default.png`,
    `${base}default.jpg`
  ];
}

function setImageWithFallback(img, paths) {
  let idx = 0;
  img.onerror = () => {
    idx += 1;
    if (idx < paths.length) {
      img.src = paths[idx];
    } else {
      img.onerror = null;
    }
  };
  img.src = paths[0];
}

// ===== RNG con semilla =====
const SEED_KEY = 'englishApp:seed';

function getSeedFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('seed');
  } catch (_) { return null; }
}

function stringToSeed(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function ensureSeededRandom() {
  if (window.seededRandom) return window.seededRandom;
  let seed = getSeedFromQuery() || localStorage.getItem(SEED_KEY);
  if (!seed) {
    seed = String(Date.now());
    localStorage.setItem(SEED_KEY, seed);
  } else {
    // si vino por query, persistimos
    localStorage.setItem(SEED_KEY, seed);
  }
  const rng = mulberry32(stringToSeed(seed));
  window.seededRandom = rng;
  return rng;
}

ensureSeededRandom();

// Utilidad: barajar arrays (Fisher–Yates) sin mutar el original usando RNG con semilla
function shuffleArray(array, rngFn = (window.seededRandom || Math.random)) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rngFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 3. Session y clave de estado
const sessionId = localStorage.getItem('sessionId') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  localStorage.setItem('sessionId', id);
  return id;
})();
const STATE_KEY = `englishApp:${sessionId}`;

// 4. Estado de la app
let categoryLevels   = {};
let currentCategory  = null;
let currentLevel     = 1;
let levelCompleted   = false;
let currentData      = [];    // <-- aquí cargamos siempre el nivel activo
let currentMode      = 'normal'; // 'normal' | 'quickcheck'
let quickCheckStats  = null;     // {correct,total,baseLevel}

// 5. Progreso global acumulado
let progressData = {
  totalCorrect:   0,
  totalIncorrect: 0,
  wordsToReview:  [],
  lastTotal:      0,
  wordStats:      {},
  missingExampleWords: [],
  // Registro de errores con la respuesta correcta asociada
  errorItems: []
};

// 6. ¿Hay progreso global?
function hasGlobalProgress() {
  return (progressData.totalCorrect + progressData.totalIncorrect) > 0;
}

// 7. Cargar estado de localStorage
function loadAppState() {
  const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  if (saved.categoryLevels)    categoryLevels    = saved.categoryLevels;
  if (saved.currentCategory)   currentCategory   = saved.currentCategory;
  if (saved.currentLevel)      currentLevel      = saved.currentLevel;
  if (typeof saved.levelCompleted === 'boolean') {
    levelCompleted = saved.levelCompleted;
  }
  if (saved.progressData)      progressData      = saved.progressData;
  // Campos nuevos por retrocompatibilidad
  progressData.missingExampleWords = progressData.missingExampleWords || [];
  progressData.errorItems = progressData.errorItems || [];
}

// 8. Guardar estado en localStorage
function saveAppState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    categoryLevels,
    currentCategory,
    currentLevel,
    levelCompleted,
    progressData
  }));
}

// 9. Mostrar menú principal
function goHome(showMenuButtons = false) {
  // 1. Mostrar vista principal
  titleEl.style.display     = 'block';
  categorySel.style.display = 'grid';
  levelMenu.style.display   = 'none';
  exerciseEl.style.display  = 'none';
  statsEl.style.display     = 'none';
  statsEl.innerHTML         = '';
  if (statsEl.dataset) statsEl.dataset.mode = '';
  errorListEl.style.display = 'none';
  errorListEl.innerHTML     = '';
  if (errorListEl.dataset) errorListEl.dataset.mode = '';
  textLessonEl.style.display = 'none';
  if (placementEl) placementEl.style.display = 'none';
  importEl.style.display     = 'none';
  if (extraCards) extraCards.style.display = 'grid';

  // 2. Limpiar y decidir si mostramos botones de acción
  actionsEl.innerHTML     = '';
  actionsEl.style.display = showMenuButtons ? 'flex' : 'none';
  if (!showMenuButtons) return;

  // 3. Botón Estadísticas (si hay progreso global)
  if (hasGlobalProgress()) {
    const btnStats = document.createElement('button');
    btnStats.textContent = 'Estadísticas';
    btnStats.onclick = () => {
      // Toggle: si ya está visible en modo 'stats', ocultar y limpiar
      const isStatsMode = statsEl.dataset && statsEl.dataset.mode === 'stats';
      const isVisible   = statsEl.style.display === 'block';
      if (isStatsMode && isVisible) {
        statsEl.style.display = 'none';
        statsEl.innerHTML = '';
        if (statsEl.dataset) statsEl.dataset.mode = '';
        return;
      }

      showStats();
      statsEl.style.display     = 'block';
      if (statsEl.dataset) statsEl.dataset.mode = 'stats';
      errorListEl.style.display = 'none';
      if (errorListEl.dataset) errorListEl.dataset.mode = '';
    };
    actionsEl.appendChild(btnStats);
  }

  // Nota: Refuerzo ahora está como card; omitimos el botón duplicado

  // 5. Botón Ver errores frecuentes
  if (progressData.totalIncorrect > 0) {
    const btnErr = document.createElement('button');
    btnErr.textContent = 'Ver errores';
    btnErr.onclick = () => {
      // Toggle: si ya está visible en modo 'errors', ocultar y limpiar
      const isErrorsMode = errorListEl.dataset && errorListEl.dataset.mode === 'errors';
      const isVisible    = errorListEl.style.display === 'block';
      if (isErrorsMode && isVisible) {
        errorListEl.style.display = 'none';
        errorListEl.innerHTML = '';
        if (errorListEl.dataset) errorListEl.dataset.mode = '';
        return;
      }

      // Mostrar respuestas correctas asociadas a errores recientes
      const grouped = progressData.errorItems.reduce((map, it) => {
        map[it.correct] = (map[it.correct] || 0) + 1;
        return map;
      }, {});
      const list = Object.entries(grouped)
        .sort((a,b)=> b[1]-a[1])
        .map(([corr, n]) => `<li>${corr} <small>(x${n})</small></li>`)
        .join('');
      errorListEl.innerHTML      = list
        ? `<p>Respuestas correctas de tus errores:</p><ul>${list}</ul>`
        : '<p>No hay errores registrados aún.</p>';
      errorListEl.style.display  = 'block';
      statsEl.style.display      = 'none';
      if (errorListEl.dataset) errorListEl.dataset.mode = 'errors';
    };
    actionsEl.appendChild(btnErr);
  }

  // Nota: Practicar errores ahora está como card; omitimos el botón duplicado

  // 6. Banco de palabras sin ejemplo
  if (progressData.missingExampleWords && progressData.missingExampleWords.length) {
    const btnBank = document.createElement('button');
    btnBank.textContent = 'Banco de palabras (sin ejemplo)';
    btnBank.onclick = () => {
      // Toggle: si ya está visible en modo 'missing', ocultar y limpiar
      const isMissingMode = errorListEl.dataset && errorListEl.dataset.mode === 'missing';
      const isVisible     = errorListEl.style.display === 'block';
      if (isMissingMode && isVisible) {
        errorListEl.style.display = 'none';
        errorListEl.innerHTML = '';
        if (errorListEl.dataset) errorListEl.dataset.mode = '';
        return;
      }

      const uniques = [...new Set(progressData.missingExampleWords)].sort();
      errorListEl.innerHTML = `<p>Sin ejemplo aún:</p><ul>${uniques.map(w=>`<li>${w}</li>`).join('')}</ul>`;
      errorListEl.style.display = 'block';
      statsEl.style.display = 'none';
      if (errorListEl.dataset) errorListEl.dataset.mode = 'missing';
    };
    actionsEl.appendChild(btnBank);
  }

  // 7. Cobertura CEFR
  const btnCoverage = document.createElement('button');
  btnCoverage.textContent = 'Cobertura CEFR';
  btnCoverage.onclick = async () => {
    // Toggle: si ya está visible en modo 'coverage', ocultar
    const isCovMode = statsEl.dataset && statsEl.dataset.mode === 'coverage';
    const isVisible = statsEl.style.display === 'block';
    if (isCovMode && isVisible) {
      statsEl.style.display = 'none';
      statsEl.innerHTML = '';
      if (statsEl.dataset) statsEl.dataset.mode = '';
      return;
    }

    // Calcular cobertura por nivel
    const cefr = await window.loadCEFRWordlists();
    const union = [
      ...(cefr.a1 || []),
      ...(cefr.a2 || []),
      ...(cefr.b1 || []),
      ...(cefr.b2 || [])
    ].map(w => (w || '').toLowerCase());

    const [infoMap, perWordModules] = await Promise.all([
      window.lookupWordInfos(union),
      window.getCoverageForWords(union)
    ]);

    function coverage(list) {
      let present = 0;
      const wordsWithGaps = [];
      (list || []).forEach(w => {
        const key = (w || '').toLowerCase();
        if (infoMap[key]) present++;
        const mods = perWordModules[key]?.modules || {};
        const hasGap = ['vocabulary','phrases','structures','conectors','tenses'].some(m => !mods[m]);
        if (hasGap) wordsWithGaps.push(w);
      });
      return { present, wordsWithGaps, total: (list || []).length };
    }

    const covA1 = coverage(cefr.a1);
    const covA2 = coverage(cefr.a2);
    const covB1 = coverage(cefr.b1);
    const covB2 = coverage(cefr.b2);

    function block(level, cov){
      const pct = cov.total ? Math.round((cov.present / cov.total) * 100) : 0;
      const missList = cov.wordsWithGaps.length ? cov.wordsWithGaps.map(w => {
        const mods = perWordModules[w.toLowerCase()]?.modules || {};
        const missingIn = Object.entries(mods)
          .filter(([,has]) => !has)
          .map(([m]) => m)
          .join(', ');
        return `${w} ${missingIn ? `(faltan: ${missingIn})` : ''}`;
      }).join(', ') : '—';
      return `
        <details>
          <summary><strong>${level}</strong>: ${cov.present}/${cov.total} con ejemplo (${pct}%) · Con gaps (módulos faltantes) ${cov.wordsWithGaps.length}</summary>
          <p style="margin:6px 0 0 0;">${missList}</p>
        </details>
      `;
    }

    statsEl.innerHTML = `
      <p>Cobertura de palabras con ejemplo por nivel (CEFR):</p>
      ${block('A1', covA1)}
      ${block('A2', covA2)}
      ${block('B1', covB1)}
      ${block('B2', covB2)}
    `;
    statsEl.style.display = 'block';
    if (statsEl.dataset) statsEl.dataset.mode = 'coverage';
    errorListEl.style.display = 'none';
    if (errorListEl.dataset) errorListEl.dataset.mode = '';
  };
  actionsEl.appendChild(btnCoverage);

  // Nota: Texto a lección ahora está como card; omitimos el botón duplicado

  // 7. Importar datos (CEFR-aware)
  const btnImport = document.createElement('button');
  btnImport.textContent = 'Importar datos (JSON)';
  btnImport.onclick = () => startImportFlow();
  actionsEl.appendChild(btnImport);
}


// 10. Botón Menu
menuBtn.addEventListener('click', () => {
  goHome(true);
});

// 11. Cargar categorías desde JSON
async function loadCategories() {
  const res = await fetch('/data/categories.json');
  const { categories } = await res.json();
  categories.forEach(cat => {
    categoryLevels[cat.id] = categoryLevels[cat.id] || 1;
    const card = document.createElement('div');
    card.className = 'category-card';
    card.tabIndex = 0;
    const img = document.createElement('img');
    const candidates = imageCandidatesForCategory(cat.id);
    img.loading = 'lazy';
    img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = 'low';
    setImageWithFallback(img, candidates);
    img.alt = cat.name;
    const body = document.createElement('div');
    body.className = 'body';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = cat.name;
    const lvl = document.createElement('div');
    lvl.className = 'level';
    lvl.textContent = `lvl ${categoryLevels[cat.id]}`;
    body.appendChild(title);
    body.appendChild(lvl);
    card.appendChild(img);
    card.appendChild(body);
    card.onclick = () => startCategory(cat);
    card.addEventListener('keypress', (e)=>{ if(e.key==='Enter') startCategory(cat);});
    categorySel.appendChild(card);
  });

  // Extra cards: Texto a lección, Refuerzo, Practicar errores
  const extras = [
    {
      id: 'text-lesson',
      title: 'Texto a lección',
      img: '/data/pictures/text-lesson.png',
      onClick: () => startTextToLessonFlow()
    },
    {
      id: 'placement-test',
      title: 'Examen de nivel',
      img: '/data/pictures/exam.png',
      onClick: () => startPlacementFlow()
    },
    {
      id: 'booster',
      title: 'Refuerzo',
      img: '/data/pictures/booster.png',
      onClick: () => startGlobalReinforcement()
    },
    {
      id: 'errors-practice',
      title: 'Practicar errores',
      img: '/data/pictures/practice-mistakes.png',
      onClick: () => startErrorsPracticeBlock()
    }
  ];

  extras.forEach(ex => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.tabIndex = 0;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = 'low';
    setImageWithFallback(img, [ex.img, '/data/pictures/default.png']);
    img.alt = ex.title;
    const body = document.createElement('div');
    body.className = 'body';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = ex.title;
    body.appendChild(title);
    card.appendChild(img);
    card.appendChild(body);
    card.onclick = ex.onClick;
    card.addEventListener('keypress', (e)=>{ if(e.key==='Enter') ex.onClick();});
    extraCards.appendChild(card);
  });
}

// 12. Iniciar categoría
async function startCategory(cat) {
  levelCompleted   = false;
  actionsEl.style.display   = 'none';
  statsEl.style.display     = 'none';
  errorListEl.style.display = 'none';
  if (extraCards) extraCards.style.display = 'none';

  currentCategory = cat.id;
  currentLevel    = categoryLevels[currentCategory] || 1;
  updateLevelDisplay();

  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  levelMenu.style.display   = 'flex';

  saveAppState();
  await loadLevel(currentLevel);
}

// 13. Cargar un nivel (único fetch, vuelca en currentData)
async function loadLevel(level) {
  updateLevelDisplay();
  const res    = await fetch(`/api/${currentCategory}/levels/${level}`);
  const data   = await res.json();
  // Barajamos el orden de los ejercicios del nivel
  currentData  = shuffleArray(data);
  progressData.lastTotal = currentData.length;
  saveAppState();
  renderQuestion(0);
}

// 14. Actualizar indicador de nivel
function updateLevelDisplay() {
  document.getElementById('level-display').textContent = `Nivel ${currentLevel}`;
}

// 15. Renderizar pregunta #index
function renderQuestion(index) {
  exerciseEl.innerHTML    = '';
  exerciseEl.style.display = 'block';

  // fin de nivel
  if (index >= currentData.length) {
    showStats();
    levelCompleted = true;
    categoryLevels[currentCategory] = currentLevel;
    saveAppState();
    goHome(true);
    return;
  }

  const item = currentData[index];
  const ex   = item.exercises[0];

  // instrucción
  const instr = document.createElement('p');
  instr.className = 'instruction';
  instr.textContent = ex.type === 'reorder'
    ? 'Construye la frase ordenando las palabras:'
    : 'Selecciona la respuesta correcta:';
  exerciseEl.appendChild(instr);

  // reorder
  if (ex.type === 'reorder') {
    const selCt    = document.createElement('div');
    const unselCt  = document.createElement('div');
    selCt.className   = 'selected-words';
    unselCt.className = 'unselected-words';
    exerciseEl.appendChild(selCt);
    exerciseEl.appendChild(unselCt);

    let selected = [];
    // Barajamos las palabras visibles al usuario
    const questionWords = shuffleArray(ex.question);
    const btnVal = document.createElement('button');
    btnVal.textContent = 'Validar';
    btnVal.className   = 'next-btn';
    btnVal.disabled    = true;
    btnVal.onclick     = () => handleAnswer(selected.join(' '), ex.correct, index);

    const btnReset = document.createElement('button');
    btnReset.textContent = 'Reiniciar';
    btnReset.className   = 'answer';
    btnReset.onclick     = () => {
      selected = [];
      updateLists();
    };

    exerciseEl.appendChild(btnVal);
    exerciseEl.appendChild(btnReset);

    function updateLists() {
      selCt.innerHTML   = '';
      unselCt.innerHTML = '';

      // palabras seleccionadas
      selected.forEach((w,i) => {
        const span = document.createElement('span');
        span.textContent = w;
        span.className   = 'selected-word';
        span.onclick     = () => { selected.splice(i,1); updateLists(); };
        selCt.appendChild(span);
      });

      // el resto
      questionWords.forEach(w => {
        if (!selected.includes(w)) {
          const btn = document.createElement('button');
          btn.textContent = w;
          btn.className   = 'answer';
          btn.onclick     = () => { selected.push(w); updateLists(); };
          unselCt.appendChild(btn);
        }
      });

      btnVal.disabled = (selected.length !== questionWords.length);
    }

    updateLists();
  }
  // multiple choice
  else {
    const q = document.createElement('p');
    q.className   = 'question';
    q.textContent = ex.question;
    exerciseEl.appendChild(q);

    // Barajamos el orden de las opciones para evitar patrón
    const shuffledOptions = shuffleArray(ex.options || []);
    shuffledOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.className = 'answer';
      btn.onclick   = () => handleAnswer(opt, ex.correct, index);
      exerciseEl.appendChild(btn);
    });
  }
}

// 16. Procesar respuesta y avanzar
function handleAnswer(answer, correct, index) {
    const item = currentData[index];
    const ex   = item.exercises[0];
  
    // 1) Calcular la clave única (sin redeclarar)
    const key = item.word
              || item.phrase
              || item.sentence
              || item.connector
              || ex.correct;   // fallback si nada anterior existe
  
    // 2) Inicializar estadísticas de esa clave
    if (!progressData.wordStats[key]) {
      progressData.wordStats[key] = { correct: 0, attempts: 0 };
    }
  
    // 3) Incrementar intentos
    progressData.wordStats[key].attempts++;
  
    // 4) Contar acierto o fallo
    const isCorrect = (answer === correct);
    if (isCorrect) {
      progressData.totalCorrect++;
      progressData.wordStats[key].correct++;
    } else {
      progressData.totalIncorrect++;
      // aquí solo se hace push de un string siempre definido
      progressData.wordsToReview.push(key);
      // guardar detalle de error: clave y respuesta correcta
      progressData.errorItems.push({ key, correct });
    }
    if (currentMode === 'quickcheck' && quickCheckStats) {
      quickCheckStats.correct += isCorrect ? 1 : 0;
    }
  
    // 5) Guardar estado
    saveAppState();
  
    // 6) Mostrar feedback
    exerciseEl.innerHTML = '';
    const fb = document.createElement('p');
    fb.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
    fb.textContent = isCorrect
      ? '✅ ¡Correcto!'
      : `❌ Incorrecto. La respuesta correcta es: "${correct}".`;
    exerciseEl.appendChild(fb);
  
    // 7) Siguiente o terminar
    const nextBtn = document.createElement('button');
    nextBtn.className = 'next-btn';
    nextBtn.textContent = (index + 1 < currentData.length) ? 'Siguiente' : 'Terminar';
    nextBtn.onclick = () => {
      if (index + 1 < currentData.length) {
        renderQuestion(index + 1);
      } else {
        if (currentMode === 'quickcheck' && quickCheckStats) {
          // finalizar verificación rápida
          const decided = decideLevelFromQuickCheck(quickCheckStats);
          showQuickCheckResult(decided);
      } else {
        levelCompleted = true;
        saveAppState();
        showStats();
        goHome(true);
        }
      }
    };
    exerciseEl.appendChild(nextBtn);
  }  

// 17. Mostrar estadísticas
function showStats() {
    // 1) Estadísticas básicas
    const total = progressData.lastTotal || 1;
    const rate  = Math.round((progressData.totalCorrect / total) * 100);
    statsEl.innerHTML = `<p>Aciertos: ${progressData.totalCorrect} de ${total} (${rate}%)</p>`;
  
    if (progressData.totalIncorrect > 0) {
      statsEl.innerHTML += `<p>Errores totales: ${progressData.totalIncorrect}</p>`;
    }
  
    // 2) Palabras a reforzar (filtrando valores falsy)
    const counts = progressData.wordsToReview.reduce((map, word) => {
      if (word) {                        // <-- ignoramos null, undefined, ''...
        map[word] = (map[word] || 0) + 1;
      }
      return map;
    }, {});
  
    const toRef = Object.entries(counts)
      .filter(([, c]) => c >= REFORCE_THRESHOLD)
      .map(([w]) => w);
  
    if (toRef.length) {
      statsEl.innerHTML += `
        <p><strong>Palabras a reforzar:</strong> ${toRef.join(', ')}</p>
      `;
    }
  
    // 3) Palabras sabidas según umbral
    const known = Object.entries(progressData.wordStats)
      .filter(([_, st]) =>
        st.attempts >= MIN_ATTEMPTS &&
        (st.correct / st.attempts) >= KNOWN_THRESHOLD
      )
      .map(([w]) => w);
  
    if (known.length) {
      statsEl.innerHTML += `
        <p>Palabras que sabes: ${known.length}</p>
        <button id="view-known" class="answer">Ver palabras conocidas</button>
      `;
    }
  
    // 4) Mostrar el contenedor de estadísticas
    statsEl.style.display = 'block';
  
    // 5) Manejador para desplegar lista de conocidas
    if (known.length) {
      document
        .getElementById('view-known')
        .addEventListener('click', () => {
          errorListEl.innerHTML = `
            <p>Lista de palabras conocidas:</p>
            <ul>
              ${known.map(w => `<li>${w}</li>`).join('')}
            </ul>
          `;
          errorListEl.style.display = 'block';
          statsEl.style.display     = 'none';
        });
    }
  }
  

// 18. Modo refuerzo
function startReinforcement() {
  // Ocultar elementos de menú y cards extra
  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  actionsEl.style.display   = 'none';
  if (placementEl) placementEl.style.display = 'none';
  if (extraCards) extraCards.style.display = 'none';
  // Mostrar barra de nivel con botón Volver
  levelMenu.style.display   = 'flex';
  document.getElementById('level-display').textContent = 'Refuerzo';
  document.getElementById('menu-btn').textContent = 'Volver al menú';
  const counts = progressData.wordsToReview.reduce((m,w)=>{
    m[w]=(m[w]||0)+1;return m;
  },{});
  const toRef = Object.entries(counts)
    .filter(([,c])=>c>=REFORCE_THRESHOLD)
    .map(([w])=>w);

  // sólo reorder que contenga esas palabras
  const filtered = currentData.filter(item =>
    item.exercises[0].type==='reorder' &&
    toRef.some(w=> item.exercises[0].correct.split(' ').includes(w))
  );

  progressData.lastTotal = filtered.length;
  exerciseEl.innerHTML = '';
  // Barajamos el subconjunto para refuerzo
  currentData = shuffleArray(filtered);
  renderQuestion(0);
}

// ===== Texto a lección =====
function startTextToLessonFlow() {
  // Ocultar todo y mostrar el contenedor
  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  levelMenu.style.display   = 'none';
  statsEl.style.display     = 'none';
  errorListEl.style.display = 'none';
  actionsEl.style.display   = 'none';
  if (extraCards) extraCards.style.display = 'none';
  if (placementEl) placementEl.style.display = 'none';

  textLessonEl.innerHTML = '';
  textLessonEl.style.display = 'block';

  // UI: textarea + botón procesar + contenedor de palabras
  const h = document.createElement('h2');
  h.textContent = 'Generar lección desde un texto';
  const ta = document.createElement('textarea');
  ta.style.width = '100%';
  ta.style.height = '160px';
  ta.placeholder = 'Pega aquí tu texto...';

  const btnProc = document.createElement('button');
  btnProc.textContent = 'Procesar texto';

  const wordsCt = document.createElement('div');
  wordsCt.style.display = 'flex';
  wordsCt.style.flexWrap = 'wrap';
  wordsCt.style.gap = '8px';
  wordsCt.style.marginTop = '12px';

  const actionsCt = document.createElement('div');
  actionsCt.style.marginTop = '16px';
  const btnBuild = document.createElement('button');
  btnBuild.textContent = 'Crear lección';
  btnBuild.disabled = true;

  const missingCt = document.createElement('div');
  missingCt.style.marginTop = '12px';

  // Botón volver al menú
  const btnBack = document.createElement('button');
  btnBack.textContent = 'Volver al menú';
  btnBack.onclick = () => goHome(levelCompleted || hasGlobalProgress());

  textLessonEl.appendChild(h);
  textLessonEl.appendChild(btnBack);
  textLessonEl.appendChild(ta);
  textLessonEl.appendChild(btnProc);
  textLessonEl.appendChild(wordsCt);
  textLessonEl.appendChild(actionsCt);
  textLessonEl.appendChild(missingCt);

  let selectedWords = new Set();
  let extractedWords = [];

  btnProc.onclick = async () => {
    const text = (ta.value || '');
    // Extraer palabras y normalizar
    const tokens = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g) || [];
    const normalized = tokens.map(w => w.toLowerCase().replace(/^'+|'+$/g, '')).filter(Boolean);

    // Stopwords mínimas en inglés
    const STOP = new Set([
      'the','a','an','and','or','but','so','to','of','in','on','at','by','for','with','from','as','that','this','these','those','it','its','is','am','are','was','were','be','been','being','i','you','he','she','we','they','me','him','her','us','them','my','your','his','her','our','their','mine','yours','hers','ours','theirs','do','does','did','not','no','yes','if','then','than','there','here','out','up','down','over','under','into','about','very','just','too','also','only','how','what','when','where','why','which'
    ]);

    // Frecuencia por palabra (sin stopwords)
    const freqMap = normalized.reduce((m, w) => {
      if (!STOP.has(w)) m[w] = (m[w] || 0) + 1;
      return m;
    }, {});
    const uniques = Object.keys(freqMap).sort();
    extractedWords = uniques;
    wordsCt.innerHTML = '';
    selectedWords = new Set();
    btnBuild.disabled = true;

    // Buscar traducciones/disponibilidad en dataset y listas CEFR
    const [infos, cefr] = await Promise.all([
      window.lookupWordInfos(uniques),
      window.loadCEFRWordlists()
    ]);

    function levelOf(word) {
      const w = (word||'').toLowerCase();
      if (cefr.a1?.includes(w)) return 'A1';
      if (cefr.a2?.includes(w)) return 'A2';
      if (cefr.b1?.includes(w)) return 'B1';
      if (cefr.b2?.includes(w)) return 'B2';
      return '-';
    }

    // Render chips con conteo y traducción sugerida
    const entries = uniques.map(w => ({
      word: w,
      count: freqMap[w] || 0,
      translations: (infos[w]?.translations || []),
      level: levelOf(w)
    }));

    // Ordenar por frecuencia desc y alfabético para estabilidad
    entries.sort((a,b)=> b.count - a.count || a.word.localeCompare(b.word));

    entries.forEach(({word: w, count, translations, level}) => {
      const chip = document.createElement('button');
      chip.className = 'answer';
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '6px';
      chip.title = `${translations.length ? `Sugerencias: ${translations.join(', ')}` : 'Sin traducción en dataset'} | Nivel: ${level}`;

      const label = document.createElement('span');
      label.textContent = w;
      const badge = document.createElement('span');
      badge.textContent = `x${count} · ${level}`;
      badge.style.fontSize = '12px';
      badge.style.opacity = '0.8';
      if (!translations.length) {
        badge.style.color = '#c62828';
      }

      chip.appendChild(label);
      chip.appendChild(badge);

      chip.onclick = () => {
        if (selectedWords.has(w)) {
          selectedWords.delete(w);
          chip.style.outline = '';
          chip.style.background = '';
        } else {
          selectedWords.add(w);
          chip.style.outline = '2px solid #1976d2';
          chip.style.background = '#e3f2fd';
        }
        btnBuild.disabled = selectedWords.size === 0;
      };
      wordsCt.appendChild(chip);
    });
  };

  btnBuild.onclick = async () => {
    // Buscar ejercicios que cubran esas palabras
    const targetWords = [...selectedWords];
    const { foundItems, missingWords } = await window.findExercisesForWords(targetWords);

    // Mostrar faltantes
    if (missingWords.length) {
      missingCt.innerHTML = `<p><strong>Sin ejemplo:</strong> ${missingWords.join(', ')}</p>`;
    } else {
      missingCt.innerHTML = '';
    }

    // Guardar en banco de palabras sin ejemplo (acumulando únicas)
    if (missingWords.length) {
      const set = new Set([...(progressData.missingExampleWords||[]), ...missingWords]);
      progressData.missingExampleWords = [...set];
    }

    // Añadir palabras seleccionadas a la lista de repaso (una vez cada una)
    targetWords.forEach(w => {
      if (!progressData.wordsToReview.includes(w)) {
        progressData.wordsToReview.push(w);
      }
    });
    saveAppState();

    if (foundItems.length === 0) {
      if (window.showAlert) showAlert('No se encontraron ejercicios para las palabras seleccionadas.');
      else alert('No se encontraron ejercicios para las palabras seleccionadas.');
      return;
    }

    // Iniciar una lección con los ejercicios encontrados
    currentData = shuffleArray(foundItems);
    progressData.lastTotal = currentData.length;

    // Ocultar el flujo de texto y mostrar ejercicios
    textLessonEl.style.display = 'none';
    levelMenu.style.display   = 'flex';
    // Rotulamos el indicador para este modo
    document.getElementById('level-display').textContent = 'Texto';
    exerciseEl.style.display  = 'block';
    renderQuestion(0);
  };

  actionsCt.appendChild(btnBuild);
}

// ===== Examen de nivel (Placement) =====
async function startPlacementFlow() {
  // Ocultar otras vistas
  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  // Mostrar barra superior con botón Volver
  levelMenu.style.display   = 'flex';
  document.getElementById('level-display').textContent = 'Examen';
  const menuButton = document.getElementById('menu-btn');
  if (menuButton) menuButton.textContent = 'Volver al menú';
  statsEl.style.display     = 'none';
  errorListEl.style.display = 'none';
  textLessonEl.style.display= 'none';
  actionsEl.style.display   = 'none';
  if (extraCards) extraCards.style.display = 'none';

  placementEl.innerHTML = '';
  placementEl.style.display = 'block';

  const h = document.createElement('h2');
  h.textContent = 'Examen de nivel';
  const p = document.createElement('p');
  p.className = 'help-text';
  p.textContent = 'Marca en el texto las palabras que no entiendes. Usaremos tus selecciones para recomendarte un nivel.';

  // Cargar un pasaje aleatorio por nivel
  const rng = (window.seededRandom || Math.random);
  async function loadList(path) {
    try { const r = await fetch(path); return r.ok ? r.json() : []; } catch(_) { return []; }
  }
  const [a1, a2, b1, b2] = await Promise.all([
    loadList('/data/placement/texts/a1.json'),
    loadList('/data/placement/texts/a2.json'),
    loadList('/data/placement/texts/b1.json'),
    loadList('/data/placement/texts/b2.json')
  ]);
  const pick = (arr) => arr && arr.length ? arr[Math.floor(rng()*arr.length)] : null;
  const passages = [pick(a1), pick(a2), pick(b1), pick(b2)].filter(Boolean);

  const container = document.createElement('div');
  container.style.textAlign = 'left';

  // Estado
  const selections = new Set();
  const STOP = new Set(['the','a','an','and','or','but','so','to','of','in','on','at','by','for','with','from','as','that','this','these','those','it','its','is','am','are','was','were','be','been','being','i','you','he','she','we','they']);
  const cefr = await window.loadCEFRWordlists();
  const levelOf = (w) => {
    if (cefr.a1.includes(w)) return 'A1';
    if (cefr.a2.includes(w)) return 'A2';
    if (cefr.b1.includes(w)) return 'B1';
    if (cefr.b2.includes(w)) return 'B2';
    return null;
  };

  function renderPassage(pass) {
    const box = document.createElement('div');
    box.className = 'panel';
    const title = document.createElement('h3');
    title.textContent = `${pass.title} (${pass.level})`;
    const para = document.createElement('p');

    const tokens = pass.text.match(/\w+|[^\w\s]+|\s+/g) || [];
    tokens.forEach(tok => {
      if (/^\s+$/.test(tok)) { para.appendChild(document.createTextNode(tok)); return; }
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ']+$/.test(tok)) { para.appendChild(document.createTextNode(tok)); return; }
      const span = document.createElement('span');
      span.textContent = tok;
      span.style.cursor = 'pointer';
      span.style.padding = '0 2px';
      span.setAttribute('role','button');
      span.setAttribute('aria-pressed','false');
      span.onclick = () => {
        const k = tok.toLowerCase().replace(/^'+|'+$/g,'');
        const known = selections.has(k);
        if (known) {
          selections.delete(k);
          span.style.background = '';
          span.setAttribute('aria-pressed','false');
        } else {
          if (!STOP.has(k)) selections.add(k);
          span.style.background = '#fff3cd';
          span.setAttribute('aria-pressed','true');
        }
      };
      para.appendChild(span);
    });
    box.appendChild(title);
    box.appendChild(para);
    return box;
  }

  passages.forEach(pas => container.appendChild(renderPassage(pas)));

  const actions = document.createElement('div');
  actions.style.marginTop = '12px';
  const btnFinish = document.createElement('button');
  btnFinish.textContent = 'Calcular nivel';

  const result = document.createElement('div');
  result.style.marginTop = '12px';

  btnFinish.onclick = async () => {
    const sel = [...selections].map(w=>w.toLowerCase());
    const counts = { A1:0, A2:0, B1:0, B2:0 };
    sel.forEach(w => { const L = levelOf(w); if (L) counts[L]++; });

    // Tasa por nivel usando denominador aproximado de palabras contenido del pasaje
    const denom = { A1:60, A2:60, B1:60, B2:60 }; // valores aproximados por pasaje corto
    const rate = {
      A1: counts.A1/denom.A1, A2: counts.A2/denom.A2, B1: counts.B1/denom.B1, B2: counts.B2/denom.B2
    };
    const order = ['A1','A2','B1','B2'];
    let recommended = 'A1';
    for (const L of order) {
      if (rate[L] <= 0.25) recommended = L; else break;
    }

    const lvlNum = {A1:1,A2:2,B1:3,B2:4}[recommended];
    const placement = { recommendedLevel: lvlNum, confidence: 0.6, unknownWords: sel, timestamp: Date.now() };
    localStorage.setItem('englishApp:placement', JSON.stringify(placement));

    result.innerHTML = `<p>Nivel recomendado: <strong>${recommended}</strong></p>
    <button class="answer" id="start-level">Comenzar en nivel ${lvlNum}</button>
    <button class="answer" id="quick-check">Verificación rápida (6 preguntas)</button>
    <button class="answer" id="build-lesson">Crear lección con mis desconocidas</button>`;

    document.getElementById('start-level').onclick = () => {
      levelCompleted = false;
      categorySel.style.display = 'none';
      placementEl.style.display = 'none';
      levelMenu.style.display = 'flex';
      currentCategory = 'vocabulary';
      currentLevel = lvlNum;
      loadLevel(currentLevel);
    };
    document.getElementById('build-lesson').onclick = async () => {
      const { foundItems } = await window.findExercisesForWords(sel);
      if (!foundItems.length) { alert('No hay ejercicios para tus desconocidas.'); return; }
      currentData = shuffleArray(foundItems);
      progressData.lastTotal = currentData.length;
      placementEl.style.display = 'none';
      levelMenu.style.display = 'flex';
      document.getElementById('level-display').textContent = 'Diagnóstico';
      exerciseEl.style.display = 'block';
      renderQuestion(0);
    };
    document.getElementById('quick-check').onclick = async () => {
      await startQuickCheck(lvlNum);
    };
  };

  actions.appendChild(btnFinish);

  placementEl.appendChild(h);
  placementEl.appendChild(p);
  placementEl.appendChild(container);
  placementEl.appendChild(actions);
  placementEl.appendChild(result);
}

// Recolecta hasta N ejercicios del nivel dado priorizando tipos variados
async function collectItemsForLevel(levelNum, max = 6) {
  const modules = ['vocabulary','phrases','structures','conectors','tenses'];
  const pool = [];
  for (const mod of modules) {
    try {
      const res = await fetch(`/api/${mod}/levels/${levelNum}`);
      if (!res.ok) continue;
      const items = await res.json();
      pool.push(...items);
    } catch(_) { /* ignore */ }
  }
  // Orden aleatorio con semilla
  const shuffled = shuffleArray(pool);
  // Seleccionar tipos: 2 choice, 2 cloze (simulate as choice con hueco), 2 reorder si hay
  const choice = [];
  const reorder = [];
  const others = [];
  shuffled.forEach(it => {
    const t = it.exercises && it.exercises[0]?.type;
    if (t === 'reorder') reorder.push(it); else choice.push(it);
  });
  const selected = [
    ...choice.slice(0, 2),
    ...reorder.slice(0, 2),
    ...choice.slice(2) // relleno
  ].slice(0, max);
  return selected;
}

function decideLevelFromQuickCheck(stats) {
  // Regla simple: 5-6 ok, 3-4 mantiene, 0-2 baja uno
  let decided = stats.baseLevel;
  if (stats.correct >= 5) decided = stats.baseLevel; // confirmar
  else if (stats.correct <= 2) decided = Math.max(1, stats.baseLevel - 1);
  return decided;
}

function showQuickCheckResult(decidedLevel) {
  exerciseEl.innerHTML = '';
  const p = document.createElement('p');
  p.innerHTML = `Resultado: ${quickCheckStats.correct}/6 correctas. Nivel sugerido final: <strong>${decidedLevel}</strong>`;
  const btnStart = document.createElement('button');
  btnStart.className = 'next-btn';
  btnStart.textContent = `Empezar en nivel ${decidedLevel}`;
  btnStart.onclick = () => {
    currentMode = 'normal';
    currentLevel = decidedLevel;
    currentCategory = 'vocabulary';
    levelMenu.style.display = 'flex';
    loadLevel(currentLevel);
  };
  const btnHome = document.createElement('button');
  btnHome.className = 'answer';
  btnHome.textContent = 'Volver al menú';
  btnHome.onclick = () => goHome(true);
  exerciseEl.appendChild(p);
  exerciseEl.appendChild(btnStart);
  exerciseEl.appendChild(btnHome);
}

async function startQuickCheck(levelNum) {
  // Cargar items del nivel; si no alcanza, mezclar con nivel inferior
  let items = await collectItemsForLevel(levelNum, 6);
  if (items.length < 6 && levelNum > 1) {
    const fill = await collectItemsForLevel(levelNum - 1, 6 - items.length);
    items = [...items, ...fill].slice(0, 6);
  }
  if (!items.length) { if (window.showAlert) showAlert('No hay suficientes ejercicios para la verificación rápida.'); else alert('No hay suficientes ejercicios para la verificación rápida.'); return; }
  quickCheckStats = { correct: 0, total: 6, baseLevel: levelNum };
  currentMode = 'quickcheck';
  currentData = shuffleArray(items).slice(0, 6);
  progressData.lastTotal = currentData.length;
  placementEl.style.display = 'none';
  levelMenu.style.display = 'flex';
  document.getElementById('level-display').textContent = 'Verificación';
  exerciseEl.style.display = 'block';
  renderQuestion(0);
}

// ===== Importador de datos CEFR-aware =====
function startImportFlow() {
  // Ocultar vistas
  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  levelMenu.style.display   = 'none';
  statsEl.style.display     = 'none';
  errorListEl.style.display = 'none';
  textLessonEl.style.display= 'none';
  if (placementEl) placementEl.style.display = 'none';
  actionsEl.style.display   = 'none';
  if (extraCards) extraCards.style.display = 'none';

  importEl.innerHTML = '';
  importEl.style.display = 'block';

  const panel = document.createElement('div');
  panel.className = 'panel import-panel';

  const h = document.createElement('h2');
  h.textContent = 'Importar datos (CEFR-aware)';
  const p = document.createElement('p');
  p.className = 'help-text';
  p.textContent = 'Sube un JSON con items en formato compatible (word/phrase/sentence/connector + exercises). Se asignará nivel CEFR cuando sea posible.';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';

  // Dropzone visual + input nativo
  const drop = document.createElement('div');
  drop.className = 'dropzone';
  const dropLabel = document.createElement('span');
  dropLabel.textContent = 'Seleccionar o arrastrar JSON';
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  fileName.textContent = 'Ningún archivo seleccionado';
  drop.appendChild(dropLabel);
  drop.appendChild(fileName);
  drop.addEventListener('click', ()=> fileInput.click());
  drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', ()=> drop.classList.remove('dragover'));
  drop.addEventListener('drop', async (e)=>{
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) {
      fileInput.files = e.dataTransfer.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });

  // Controles de import real
  const controls = document.createElement('div');
  controls.className = 'form-row';
  const modeSel = document.createElement('select');
  ;['append','replace'].forEach(v=>{
    const o=document.createElement('option'); o.value=v; o.textContent=v; modeSel.appendChild(o);
  });
  const modeLbl = document.createElement('label');
  modeLbl.textContent = 'Modo:';
  modeLbl.appendChild(modeSel);

  const lvlInp = document.createElement('input');
  lvlInp.type = 'number';
  lvlInp.min = '1';
  lvlInp.max = '3';
  lvlInp.placeholder = 'defaultLevel (opcional)';
  lvlInp.style.width = '220px';

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Importar al servidor';
  importBtn.disabled = true;

  controls.appendChild(modeLbl);
  controls.appendChild(lvlInp);
  controls.appendChild(importBtn);

  const btnBack = document.createElement('button');
  btnBack.className = 'btn-ghost';
  btnBack.textContent = 'Volver al menú';
  btnBack.onclick = () => goHome(levelCompleted || hasGlobalProgress());

  const result = document.createElement('div');
  result.style.marginTop = '12px';

  panel.appendChild(h);
  panel.appendChild(p);
  panel.appendChild(drop);
  panel.appendChild(fileInput);
  panel.appendChild(controls);
  panel.appendChild(btnBack);
  panel.appendChild(result);
  importEl.appendChild(panel);

  let parsedItems = [];
  let parsedDefaultLevel = null;

  fileInput.onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const items = Array.isArray(json) ? json : (json.items || []);
      if (!Array.isArray(items) || !items.length) {
        result.innerHTML = '<p style="color:#c62828">El archivo no contiene items válidos.</p>';
        return;
      }
      fileName.textContent = f.name;

      const cefr = await window.loadCEFRWordlists();
      const setA1 = new Set((cefr.a1||[]));
      const setA2 = new Set((cefr.a2||[]));
      const setB1 = new Set((cefr.b1||[]));
      const setB2 = new Set((cefr.b2||[]));
      const STOP = new Set(['the','a','an','and','or','but','so','to','of','in','on','at','by','for','with','from','as','that','this','these','those','it','its','is','am','are','was','were','be','been','being','i','you','he','she','we','they']);
      const tokenLevel = (w) => setA1.has(w)?'A1' : setA2.has(w)?'A2' : setB1.has(w)?'B1' : setB2.has(w)?'B2' : null;
      const determineLevel = (key) => {
        const w = (key||'').toLowerCase();
        // match directo
        const direct = tokenLevel(w);
        if (direct) return direct;
        // estimar por tokens
        const tokens = w.match(/[a-zÀ-ÖØ-öø-ÿ']+/g) || [];
        // Elegimos el nivel MÁS BAJO presente (si hay A1 y A2, retorna A1)
        const rank = {A1:1,A2:2,B1:3,B2:4};
        let chosen = null;
        let chosenRank = Infinity;
        tokens.forEach(t => {
          if (STOP.has(t)) return;
          const L = tokenLevel(t);
          if (L) {
            const r = rank[L];
            if (r < chosenRank) { chosenRank = r; chosen = L; }
          }
        });
        return chosen; // puede ser null si ningún token está en CEFR
      };

      // Funciones para prever el enrutado real (mismas reglas del servidor)
      const guessTenseFromPhrase = (lower) => {
        if (!lower) return null;
        if (/^had\s+\w+/.test(lower)) return 'past-perfect';
        if (/^(would|could|should)\s+have\s+\w+/.test(lower)) return 'conditional-perfect';
        if (/^(will)\s+\w+/.test(lower)) return 'future-simple';
        if (/^(am|is|are)\s+\w+ing/.test(lower)) return 'present-continuous';
        return null;
      };
      const routePreview = (raw) => {
        const item = raw;
        const ex = item.exercises && item.exercises[0];
        const origMod = item.phrase ? 'phrases'
                        : item.connector ? 'conectors'
                        : item.sentence ? 'structures'
                        : (item.tense ? 'tenses' : 'vocabulary');
        const key = item.word || item.phrase || item.connector || item.sentence || (ex && ex.correct);
        let mod = origMod;
        const lower = (key||'').toLowerCase().trim();
        const hasSpace = /\s/.test(lower);
        if (mod === 'vocabulary' && hasSpace) {
          const guessed = guessTenseFromPhrase(lower);
          if (guessed) mod = 'tenses';
          else {
            const isShort = lower.split(/\s+/).length <= 3 && !(/[\.,;:!?]/.test(key));
            mod = isShort ? 'phrases' : 'structures';
          }
        }
        if (mod === 'phrases' && !hasSpace) mod = 'vocabulary';
        return { key, mod, origMod, rerouted: mod !== origMod };
      };

      // Simular anexado: agrupar por módulo y nivel CEFR y recolectar UNASSIGNED + REROUTES
      const buckets = {};
      const unassignedByMod = {};
      const reroutes = [];
      items.forEach(item => {
        const routed = routePreview(item);
        const key = routed.key;
        const mod = routed.mod;
        if (routed.rerouted) reroutes.push({ key: (key||'').toLowerCase(), from: routed.origMod, to: mod });
        if (!key) return;
        const level = determineLevel(key);
        const bucketKey = `${mod}:${level||'UNASSIGNED'}`;
        (buckets[bucketKey] ||= []).push(item);
        if (!level) {
          const k = (key||'').toLowerCase();
          (unassignedByMod[mod] ||= new Set()).add(k);
        }
      });

      // Render resumen con detalle de UNASSIGNED
      const keys = Object.keys(buckets).sort();
      const lines = keys.map(k => {
        const isUn = k.endsWith(':UNASSIGNED');
        if (!isUn) return `<li>${k}: ${buckets[k].length} items</li>`;
        const [mod] = k.split(':');
        const list = Array.from(unassignedByMod[mod]||[]).sort();
        const detail = list.length ? `<details><summary>${k}: ${buckets[k].length} items</summary><ul>${list.map(w=>`<li>${w}</li>`).join('')}</ul></details>` : `<li>${k}: ${buckets[k].length} items</li>`;
        return detail;
      }).join('');
      const rerouteBlock = reroutes.length
        ? `<div class="panel" style="margin-top:12px;">
             <p><strong>Ajustes previstos:</strong></p>
             <ul style="text-align:left; margin-top:8px;">
               ${reroutes.map(r => `<li>"${r.key}" se importará como <code>${r.to}</code> (venía como <code>${r.from}</code>)</li>`).join('')}
             </ul>
             <p class="help-text">Ej.: una "phrase" de una sola palabra se moverá a vocabulary; una "word" con espacios puede ir a phrases/structures o tenses.</p>
           </div>`
        : '';

      result.innerHTML = `
        <div class="panel" style="margin-top:12px;">
          <p><strong>Resumen de importación:</strong></p>
          <ul style="text-align:left; margin-top:8px;">${lines}</ul>
          <p class="help-text" style="margin-top:8px;">UNASSIGNED = sin nivel CEFR detectado. Asigna un nivel con "defaultLevel" o corrige la clave. Puedes revisar el detalle por módulo desplegando cada sección.</p>
        </div>
        ${rerouteBlock}
      `;

      parsedItems = items;
      // tomar defaultLevel del archivo si existe
      if (!Number.isNaN(parseInt(json.defaultLevel, 10))) {
        parsedDefaultLevel = parseInt(json.defaultLevel, 10);
        lvlInp.value = String(parsedDefaultLevel);
      } else {
        parsedDefaultLevel = null;
      }
      importBtn.disabled = false;
    } catch(err) {
      result.innerHTML = `<p style="color:#c62828">Error al leer JSON: ${err.message}</p>`;
    }
  };

  importBtn.onclick = async () => {
    if (!parsedItems.length) return;
    importBtn.disabled = true;
    result.innerHTML = '<p>Importando...</p>';
    try {
      const body = {
        items: parsedItems,
        mode: modeSel.value || 'append'
      };
      let n = parseInt(lvlInp.value, 10);
      if (Number.isNaN(n)) n = parsedDefaultLevel;
      if (!Number.isNaN(n) && n != null) body.defaultLevel = n;

      const resp = await fetch('/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const contentType = resp.headers.get('content-type') || '';
      const raw = await resp.text();
      let data;
      try {
        data = contentType.includes('application/json') ? JSON.parse(raw) : {};
      } catch (_) {
        data = {};
      }
      if (!resp.ok) {
        const msg = data.error || raw.slice(0, 200) || 'Error desconocido';
        throw new Error(msg);
      }
      const list = (data.summary||[])
        .map(s => `<li>${s.file}: añadidos ${s.added}, total ${s.total}</li>`) 
        .join('');
      result.innerHTML = `<p>Importación OK:</p><ul>${list}</ul>`;
    } catch (e) {
      result.innerHTML = `<p style=\"color:#c62828\">Fallo importando: ${e.message}</p>`;
    } finally {
      importBtn.disabled = false;
    }
  };
}

// ===== Bloque de práctica de errores =====
async function startErrorsPracticeBlock() {
  // 1) claves de error por frecuencia
  const counts = (progressData.errorItems || []).reduce((map, it) => {
    if (it && it.key) map[it.key] = (map[it.key] || 0) + 1;
    return map;
  }, {});
  const sortedKeys = Object.entries(counts)
    .sort((a,b)=> b[1]-a[1])
    .map(([k])=>k);
  if (!sortedKeys.length) {
    if (window.showAlert) showAlert('No hay errores para practicar.'); else alert('No hay errores para practicar.');
    return;
  }

  // 2) buscar ejercicios para esas claves (tomamos más de las necesarias por si faltan)
  const targetKeys = sortedKeys.slice(0, ERROR_BLOCK_SIZE * 2);
  const { foundItems } = await window.findExercisesForWords(targetKeys);
  if (!foundItems || foundItems.length === 0) {
    if (window.showAlert) showAlert('No se encontraron ejercicios para tus errores.'); else alert('No se encontraron ejercicios para tus errores.');
    return;
  }

  // 3) barajar por semilla y recortar al tamaño del bloque
  const block = shuffleArray(foundItems).slice(0, ERROR_BLOCK_SIZE);

  // 4) inicializar la sesión
  currentData = block;
  progressData.lastTotal = currentData.length;
  saveAppState();

  titleEl.style.display     = 'none';
  categorySel.style.display = 'none';
  actionsEl.style.display   = 'none';
  statsEl.style.display     = 'none';
  errorListEl.style.display = 'none';
  textLessonEl.style.display = 'none';
  if (placementEl) placementEl.style.display = 'none';
  if (extraCards) extraCards.style.display = 'none';

  levelMenu.style.display   = 'flex';
  document.getElementById('level-display').textContent = 'Errores';
  document.getElementById('menu-btn').textContent = 'Volver al menú';
  exerciseEl.style.display  = 'block';
  renderQuestion(0);
}

// 19. Inicialización
loadAppState();
loadCategories().then(()=>{
  goHome(true);
});

// ===== Modal Alert bonito =====
function showAlert(message, title = 'Aviso') {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  const card = document.createElement('div');
  card.className = 'modal-card';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const ok = document.createElement('button');
  ok.className = 'btn-primary';
  ok.textContent = 'Entendido';
  ok.onclick = () => document.body.removeChild(back);
  actions.appendChild(ok);
  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(actions);
  back.appendChild(card);
  back.addEventListener('click', (e)=>{ if (e.target === back) document.body.removeChild(back); });
  document.body.appendChild(back);
}
