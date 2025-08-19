# English App

Aplicación educativa en Node.js para aprender inglés basada en vocabulario y refuerzo de errores.

## Instalación

1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Corre el servidor: `npm start`.

## Estructura

- server.js: servidor Express.
- public/: archivos estáticos (HTML, CSS, JS).
- public/data/: datos de niveles y categorías.

## Uso

Abre `http://localhost:3000` en tu navegador.





# 📘 English Glosenaut App

Aplicación web educativa para aprender inglés de forma interactiva, centrada en vocabulario, estructuras gramaticales, conectores y más. Inspirada en la simplicidad de Duolingo, sin login, usando almacenamiento local para guardar progreso y errores.

---

## 🎯 Objetivo

Brindar una herramienta ligera pero poderosa para practicar inglés desde cero, reforzando errores y adaptando el contenido a distintos niveles (niveles tipo A1–B1).

---

## 🧠 Módulos de Aprendizaje

Cada módulo se compone de ejercicios interactivos y adaptables:

### 🔹 Vocabulary
- Palabras organizadas por niveles.
- Traducción y uso en contexto.

### 🔹 Phrases
- Frases comunes para conversaciones cotidianas.
- Estructuras útiles por tema.

### 🔹 Structures
- Construcción de oraciones.
- Ejercicios con tiempos verbales, condicionales, comparativos, etc.

### 🔹 Conectors
- Uso de conectores como: *although, however, because, therefore*.
- Ejercicios para completar frases lógicamente.

---

## 🧩 Módulos Extra (en desarrollo)

### 🔹 Tenses
- Enfoque por tiempo verbal (past, present, future, perfect...).
- Ejercicios gramaticales por estructura temporal.

### 🔹 Listening
- Comprensión auditiva con audios breves.
- Preguntas múltiples basadas en audio.

### 🔹 Pronunciation
- Palabras con guía fonética.
- Ejercicios de repetición o reconocimiento.

### 🔹 Irregular Verbs
- Verbos irregulares con ejemplos y práctica.
- Ejercicios para completar conjugaciones.

### 🔹 False Friends
- Palabras confusas entre inglés y español.
- Ejercicios para identificar su verdadero significado.

### 🔹 Prepositions
- Uso correcto de *in, on, at, by, with*...
- Ejercicios visuales.

### 🔹 Articles & Quantifiers
- Uso de *a, an, the, some, much, many*...
- Completar frases según el contexto.

### 🔹 Word Formation
- Formación de palabras: verb → noun → adj → adv
- Ejercicios de transformación.

### 🔹 Daily English
- Frases útiles según situación: restaurante, aeropuerto, oficina, etc.

### 🔹 Reading Practice
- Lecturas cortas con preguntas de comprensión.

### 🔹 Cultural Tips
- Datos sobre expresiones nativas y diferencias culturales en el uso del idioma.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML + CSS + JavaScript puro
- **Backend**: Node.js con Express (opcional)
- **Almacenamiento**: localStorage para guardar progreso, errores, y sesión

## 🚢 Docker

Ejecuta la aplicación en contenedor y persiste los datos de `public/data` en tu máquina.

### Con Docker Compose (recomendado)

```bash
cd /Users/serome/Documents/Sites/Glossonaut
docker compose build
docker compose up -d
```

- Accede: `http://localhost:3000`
- Los datos se guardan en `./public/data` gracias al volumen mapeado.

### Con Docker (sin compose)

```bash
cd /Users/serome/Documents/Sites/Glossonaut
docker build -t glossonaut .
docker run --name glossonaut \
  -p 3000:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -v $(pwd)/public/data:/usr/src/app/public/data \
  glossonaut
```

### Probar API

```bash
curl http://localhost:3000/api/vocabulary/levels/1
```

### Rebuild tras cambios

```bash
docker compose build --no-cache && docker compose up -d
```

---

## 🎲 Aleatoriedad con semilla (reproducible)

Para reproducir exactamente el orden de ejercicios/opciones, puedes fijar una semilla:

- En la URL: `http://localhost:3000/?seed=mi-semillita`
- La app guardará la semilla en `localStorage` con clave `englishApp:seed` para futuras sesiones.
- Para cambiarla, usa otra `?seed=...` o limpia la guardada:

```js
localStorage.removeItem('englishApp:seed');
location.reload();
```

Qué afecta la semilla:
- Orden de ejercicios al cargar un nivel
- Orden de opciones en preguntas de selección
- Orden de palabras en ejercicios de “reorder”
- Orden del conjunto en el modo de refuerzo (local y global)
- Barajado en el flujo “Texto a lección”

---

## 📥 Importación de datos (CEFR‑aware)

Puedes poblar los módulos (`vocabulary`, `phrases`, `structures`, `conectors`, `tenses`) enviando items al endpoint del servidor. El sistema detecta el módulo a partir de los campos del item y asigna nivel por CEFR cuando sea posible.

### Endpoint
- Método: POST
- Ruta: `/admin/import`
- Body JSON:

```json
{
  "items": [ /* array de items */ ],
  "mode": "append" | "replace",
  "defaultLevel": 1
}
```

- `items` (obligatorio): cada item debe tener alguno de estos campos como clave y al menos un ejercicio:
  - `word` | `phrase` | `sentence` | `connector`
  - `exercises`: array con objetos tipo `{ type, question, options?, correct }`
- `mode` (opcional):
  - `append` agrega sin duplicar claves
  - `replace` reemplaza el archivo de nivel por completo antes de agregar
- `defaultLevel` (opcional): nivel usado solo si la clave no aparece en las listas CEFR; si se omite, vale 1

### Asignación de módulo y nivel
- Módulo inferido por el campo presente:
  - `phrase` → `phrases`
  - `sentence` → `structures`
  - `connector` → `conectors`
  - si no aplica, `word` → `vocabulary`
- Nivel por CEFR (desde `public/data/wordlists/cefr/*.json`):
  - A1 → `lvl1`
  - A2 → `lvl2`
  - B1 → `lvl3`
  - B2 → `lvl4`
  - Si no está en CEFR → usa `defaultLevel`

### Duplicados
Se ignoran por clave normalizada: `word|phrase|sentence|connector` o, como respaldo, `exercises[0].correct`.

### Ejemplo de importación
Archivo `coffee_phrase.json`:

```json
{
  "items": [
    {
      "phrase": "coffee",
      "translations": ["café"],
      "exercises": [
        { "type": "translate", "question": "coffee", "options": ["té","café","agua","jugo"], "correct": "café" },
        { "type": "complete", "question": "I drink ____ in the morning.", "options": ["coffee","tea","milk","water"], "correct": "coffee" }
      ]
    }
  ],
  "mode": "append"
}
```

Comando:

```bash
curl -X POST http://localhost:3000/admin/import \
  -H "Content-Type: application/json" \
  --data @coffee_phrase.json
```

Esto guardará (o añadirá) el item en `public/data/phrases/lvl1.json` porque “coffee” está listado como A1.

---

## 📂 Estructura de Archivos (ejemplo)


#to do repeticion espaciada
