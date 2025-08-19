#To Do list

Mejoras rápidas (1–2 días)

Manifest de datos: un public/data/manifest.json con niveles disponibles por categoría para evitar 404 y descubrir niveles dinámicamente.

UX de práctica:
Botón “No lo sé” que cuenta como fallo y muestra la correcta.

Atajos de teclado (1–4 para opciones, Enter para validar).

Indicadores de carga y manejo de errores fetch amigable.

Errores reutilizables: botón “Practicar errores” que inicie una sesión solo con errorItems.

Texto a lección:
Guardar listas con nombre y permitir exportar CSV.

Nombres consistentes: unificar conectors/connectors o añadir alias en el servidor para ambos.

Funciones de siguiente nivel
Spaced Repetition real: SM-2/Leitner con “revisiones pendientes hoy”, próxima fecha por palabra y curva de olvido.

Audio y pronunciación:
TTS con SpeechSynthesis para escuchar cada ítem.
STT con SpeechRecognition para practicar pronunciación (modo dictado).
Más tipos de ejercicio: cloze dentro de frases del texto, emparejar traducciones, producción libre con verificación flexible.
Contexto y explicación: en “Ver errores” mostrar la oración de ejemplo y una breve explicación gramatical.

Etiquetas CEFR/frecuencia: priorizar palabras A1–B1 y de alta frecuencia.

PWA offline: Service Worker para cachear JSON y practicar sin conexión.
Accesibilidad: foco visible, roles ARIA, contraste, navegación con teclado.
Sugerencias de uso (rutina eficaz)
Diaria (15–20 min):
Pega un texto corto, selecciona 8–12 palabras desconocidas, genera lección.

Semanal:
Revisa el banco de palabras sin ejemplo y añade ejercicios al dataset.
Mira estadísticas por palabra y limpia las ya dominadas.
Objetivo claro: fija un mínimo (p. ej., 30 aciertos/día o 2 revisiones espaciadas).
Si quieres, priorizo e implemento:
Manifest de datos + alias connectors/conectors
“Practicar errores” como módulo
Stopwords y frecuencia en “Texto a lección”
TTS en los ejercicios




quiero hacer una opcion que cargue textos de un json que tenga por ahi en data, básicamente este json va a ser para determinar en que nivel está y que plabras de nivel debe aprender, el nivel consiste en que leerá el json y creara una vista donde seleccionaras las palabra que no entiendes del texto, pero el texto no estará separado si no que la idéa es que sea como un texto normal, pero que el solo seleccione las palabras que no entiende y pues basado en que estas palabras sean de x nivel al final posicionar en un nivel al usuario.





echo-> quiero crear una lista de palabras en el sistema son aproximadamente 5000 palabras para aprender ingles creo supongo, la idea es tener un json con estas palabras para cada nivel, a1,a2,b1,b2 y asi.... entonces el sistema en algun lado me diga  ejemplo faltan ejemplos o x palabras para el lvl 1 o lvl 2, basado en lo que carga del archivo json principal, con base a todo lo que ya tengo no sé como debería hacerlo, ejemplo si el usaurio sube un texto estas palabras ya deben estar en las listas que en teoria tengo de cada nivel, puedes crear esto y asignar unos archivo para cada nivel de ingles con unas pocas palabras para probar?




echo->Quiero poblar con datos mi archivos que estan en data, la idéa es que exista un modulo donde suba un json extra en el formato correcto para ir anexando datos para cada tipo de modulo, ejemplo, subir conectors, pharases, structures, tenses y vocabulary, la idéa es que este tambien a su vez entienda el CEFR y asigne las palabras a su respectivo nivel, supongo hay que modificar algunas cosas ya que actualmente esta es por lvl1,lvl2 y así....


Mejoras de alto impacto para lanzamiento (prioridad)
Colocación inicial: mini test adaptativo (10–15 ítems) para sugerir nivel A1–B2.
Spaced Repetition real: agenda de repaso con SM‑2/Leitner; cola “debido hoy” y recordatorios.
Más tipos de ejercicio:
Listening: TTS para palabra/frase (Web Speech API).
Typing: respuesta escrita con tolerancia a typos (Levenshtein pequeña).
Cloze (huecos) y “match pares” para reforzar conectores/structures.
Pistas y explicación: botón “ver pista” y “por qué esta es correcta” con breve regla o ejemplo adicional.
Metas y streak: objetivo diario (p.ej., 20 ítems), rachas, XP/badges básicos.

Contenido y gestión
Cobertura CEFR 2.0: tendencias por semana, top “gaps” por módulo, export CSV/JSON de faltantes.
Autoría segura: validación con JSON Schema (Ajv), dedupe y normalización previa al guardado, vista de diff antes de aplicar, backup automático por archivo.
Distractores automáticos: generar opciones incorrectas por cercanía semántica/frecuencia; reglas simples iniciales (sinónimos/antónimos básicos, mismos POS).

UX/UI
PWA: instalable y offline (service worker + cache de nivel activo + assets).
Accesibilidad: roles ARIA, foco/teclado completo, contraste AA, tamaños hit-area móviles.
Buscador / Diccionario: buscar palabra y ver ejemplos en todos los módulos; marcar como “aprendida” manualmente.
Modo enfoque: temporizador Pomodoro, ocultar metainfo para reducir distracciones.


Rendimiento y robustez
Índice en servidor: endpoint que devuelva presencia por palabra en 1 llamada (evitar múltiples fetch por módulo/level).
Compresión y cache: gzip/br brotli para JSON, ETags/Cache-Control, precarga de imágenes.
Errores controlados: fallback silencioso para assets faltantes; logging de frontend (Sentry) con sampleo.

Seguridad y administración
Auth para importador: token simple o basic auth; rate limiting; CORS restringido.
Escritura atómica: guardar en temp y rename; bloqueo concurrente; historial de versiones.
Panel admin: subir/editar items con validación en vivo, vista previa y pruebas rápidas.

Analítica y calidad
Eventos clave: inicio/fin lección, aciertos/fallos por palabra, tiempo por ítem, abandono.
Experimentos A/B: orden de opciones, tipo de feedback, tamaño de bloque.
Tests: unit (randomización/SM‑2), e2e (Playwright) de los flujos principales, CI rápido.
Lighthouse: accesibilidad, PWA y performance >90.

Roadmap breve
Colocación + SRS + PWA.
Nuevos tipos de ejercicio + pistas.
Panel admin con validación/diff/backup.
Índice/endpoint de cobertura server-side + analítica.
Gamificación ligera + email/push de repaso.
Si quieres, te priorizo estas tareas en issues con criterios de aceptación y estimados.