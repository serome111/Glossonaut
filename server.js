// server.js
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Obtiene los niveles según categoría
app.get('/api/:category/levels/:level', (req, res) => {
  const { category, level } = req.params;
  const dirCategory = category === 'connectors' ? 'conectors' : category;
  res.sendFile(
    path.join(__dirname, 'public', 'data', dirCategory, `lvl${level}.json`)
  );
});

// --- Admin import endpoint (CEFR-aware) ---
// POST /admin/import
// Body: { items: Array<Item>, mode?: 'append'|'replace', defaultLevel?: number }
// Item schema: { word|phrase|sentence|connector, translations?: string[], exercises: [...] }
app.post('/admin/import', async (req, res) => {
  try {
    const { items = [], mode = 'append', defaultLevel = 1 } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array requerido' });
    }

    // Load CEFR wordlists
    async function loadList(p) {
      try {
        const data = await fs.readFile(p, 'utf8');
        return JSON.parse(data);
      } catch { return []; }
    }
    const base = path.join(__dirname, 'public', 'data', 'wordlists', 'cefr');
    const [a1Raw, a2Raw, b1Raw, b2Raw] = await Promise.all([
      loadList(path.join(base, 'a1.json')),
      loadList(path.join(base, 'a2.json')),
      loadList(path.join(base, 'b1.json')),
      loadList(path.join(base, 'b2.json')),
    ]);
    // Construir mapa canónico: palabra -> nivel CEFR más bajo
    const normalizeUnique = (list) => {
      const out = [];
      const seen = new Set();
      (Array.isArray(list) ? list : []).forEach(w => {
        const k = (w||'').toLowerCase().trim();
        if (!k || seen.has(k)) return; seen.add(k); out.push(k);
      });
      return out;
    };
    const a1 = normalizeUnique(a1Raw);
    const a2 = normalizeUnique(a2Raw);
    const b1 = normalizeUnique(b1Raw);
    const b2 = normalizeUnique(b2Raw);

    const canonical = new Map(); // wordLower -> 1..4 (lvl)
    const pushCanonical = (arr, lvl) => arr.forEach(w => { if (!canonical.has(w)) canonical.set(w, lvl); });
    pushCanonical(a1, 1);
    pushCanonical(a2, 2);
    pushCanonical(b1, 3);
    pushCanonical(b2, 4);

    const cefrToLevel = (w) => {
      const lw = (w||'').toLowerCase();
      return canonical.get(lw) || defaultLevel;
    };

    function inferKeyAndModule(item) {
      const ex = item.exercises && item.exercises[0];
      const key = item.word || item.phrase || item.connector || item.sentence || (ex && ex.correct);
      let mod = 'vocabulary';
      if (item.phrase) mod = 'phrases';
      else if (item.connector) mod = 'conectors'; // priorizar conector aunque tenga oración de ejemplo
      else if (item.sentence) mod = 'structures';
      else if (item.tense || (ex && /(to\s+\w+)/i.test(ex?.question||''))) mod = 'tenses';
      return { key, mod };
    }

    // Heurística: clasificar mejor y normalizar el item antes de agrupar
    function guessTenseFromPhrase(phraseLower) {
      if (!phraseLower) return null;
      if (/^had\s+\w+/.test(phraseLower)) return 'past-perfect';
      if (/^(would|could|should)\s+have\s+\w+/.test(phraseLower)) return 'conditional-perfect';
      if (/^(will)\s+\w+/.test(phraseLower)) return 'future-simple';
      if (/^(am|is|are)\s+\w+ing/.test(phraseLower)) return 'present-continuous';
      return null;
    }

    function normalizeAndRouteItem(rawItem) {
      const item = JSON.parse(JSON.stringify(rawItem));
      const ex = item.exercises && item.exercises[0];
      let { key, mod } = inferKeyAndModule(item);
      const lower = (key || '').toLowerCase().trim();

      // Normalizaciones de clave
      if (mod === 'conectors' && item.connector) item.connector = lower;
      if (mod === 'phrases' && item.phrase) item.phrase = item.phrase.trim();
      if (mod === 'vocabulary' && item.word) item.word = lower;

      // Reenrutado basado en forma de la clave
      const hasSpace = /\s/.test(lower);
      if (mod === 'vocabulary' && hasSpace) {
        // es una frase/oración o una locución verbal
        const guessed = guessTenseFromPhrase(lower);
        if (guessed) {
          // mover a tenses
          delete item.word;
          item.tense = guessed;
          item.example = key;
          mod = 'tenses';
        } else {
          // si es corta, tratar como phrase; si es larga o con puntuación, structure
          const tokens = lower.split(/\s+/);
          const isShort = tokens.length <= 3 && !/[\.,;:!?]/.test(key);
          delete item.word;
          if (isShort) { item.phrase = key; mod = 'phrases'; }
          else { item.sentence = key; mod = 'structures'; }
        }
      }
      if (mod === 'phrases' && key && !/\s/.test(key)) {
        // frase de una sola palabra → vocabulary
        delete item.phrase;
        item.word = lower;
        mod = 'vocabulary';
      }

      // devolver clave recalculada
      const newEx = item.exercises && item.exercises[0];
      const newKey = item.word || item.phrase || item.sentence || item.connector || item.example || (newEx && newEx.correct);
      return { item, key: newKey, mod };
    }

    const groups = new Map(); // key: `${mod}:lvl${n}` -> items
    for (const raw of items) {
      const { item, key, mod } = normalizeAndRouteItem(raw);
      if (!key) continue;
      const lvl = cefrToLevel(key);
      const k = `${mod}:lvl${lvl}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(item);
    }

    const summary = [];
    for (const [k, arr] of groups.entries()) {
      const [mod, lvlTag] = k.split(':');
      const dir = path.join(__dirname, 'public', 'data', mod);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${lvlTag}.json`);

      let existing = [];
      try {
        const raw = await fs.readFile(file, 'utf8');
        existing = JSON.parse(raw);
      } catch {}

      if (mode === 'replace' || !Array.isArray(existing)) existing = [];

      const keyOf = (it) => {
        const ex0 = it.exercises && it.exercises[0];
        return (it.word||it.phrase||it.sentence||it.connector||(it.example)|| (ex0 && ex0.correct) || '').toLowerCase();
      };
      const seen = new Set(existing.map(keyOf));

      // Conjunto de claves nuevas (para purgar duplicados en otros niveles)
      const newKeys = new Set();
      for (const it of arr) {
        const key = keyOf(it);
        if (!key) continue;
        if (seen.has(key)) {
          // merge with existing item (unir exercises y translations)
          const idx = existing.findIndex(e => keyOf(e) === key);
          if (idx >= 0) {
            const target = existing[idx];
            // translations
            const tA = Array.isArray(target.translations) ? target.translations : [];
            const tB = Array.isArray(it.translations) ? it.translations : [];
            const tSet = new Set([...
              tA.filter(Boolean), ...tB.filter(Boolean)
            ]);
            if (tSet.size) target.translations = Array.from(tSet);
            // exercises (dedupe por type+question+correct)
            const eA = Array.isArray(target.exercises) ? target.exercises : [];
            const eB = Array.isArray(it.exercises) ? it.exercises : [];
            const sig = (e) => `${e?.type||''}|${e?.question||''}|${e?.correct||''}`;
            const sigs = new Set(eA.map(sig));
            eB.forEach(e => { const s = sig(e); if (!sigs.has(s)) { eA.push(e); sigs.add(s);} });
            target.exercises = eA;
          }
        } else {
          existing.push(it);
          seen.add(key);
          newKeys.add(key);
        }
      }

      await fs.writeFile(file, JSON.stringify(existing, null, 2), 'utf8');
      summary.push({ file: path.relative(__dirname, file), added: newKeys.size, total: existing.length });

      // Eliminar duplicados de estas claves en otros niveles del mismo módulo
      const currentLvl = parseInt(lvlTag.replace('lvl',''), 10);
      const levels = [1,2,3,4];
      for (const lv of levels) {
        if (lv === currentLvl) continue;
        const otherFile = path.join(dir, `lvl${lv}.json`);
        try {
          const raw = await fs.readFile(otherFile, 'utf8');
          let list = JSON.parse(raw);
          const before = Array.isArray(list) ? list.length : 0;
          if (!Array.isArray(list) || before === 0) continue;
          const filtered = list.filter(it => {
            const ex = it.exercises && it.exercises[0];
            const key = (it.word||it.phrase||it.sentence||it.connector||(ex&&ex.correct)||'').toLowerCase();
            return !newKeys.has(key);
          });
          if (filtered.length !== before) {
            await fs.writeFile(otherFile, JSON.stringify(filtered, null, 2), 'utf8');
          }
        } catch { /* ignore missing other levels */ }
      }
    }

    res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
