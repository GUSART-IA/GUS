# GUS · Puente Higgsfield → After Effects

> Adaptaciones del KV de **CM DIGITAL ECOMMERCE** (Illustrator → AE, loop de 3
> piezas por medida de pantalla): ver [`ccb-ecommerce/`](ccb-ecommerce/README.md).

Pipeline para construir un **editable** (plantilla paramétrica) sobre el video de
la composición **CAMPAÑA INTEGRAL**, y para bajar assets generados en Higgsfield
directamente a esa plantilla.

## Por qué hay scripts y no automatización directa

Claude corre en un contenedor Linux en la nube, sin acceso a tu máquina ni a tu
After Effects abierto, y **no existe un conector de After Effects** — el único
conector instalado es Higgsfield (verificado en vivo: plan *ultra*, workspace
privado). Ningún agente remoto puede tocar tu timeline.

La ruta que sí funciona es la nativa de AE: **ExtendScript**. Los scripts de
`ae/` hacen el trabajo dentro de tu AE, con tu proyecto abierto, en un solo paso.

## 1 · Construir el editable

`Archivo > Scripts > Ejecutar archivo de script…` → `ae/CampanaIntegral_Editable.jsx`

Busca la comp `CAMPAÑA INTEGRAL` (la coincidencia ignora acentos; si no la
encuentra ofrece usar la comp activa), detecta la capa de video más baja y
construye encima:

| Capa | Función |
|---|---|
| `HF \| GUIAS` | Márgenes de seguridad 90 % / 80 %, capa de guía |
| `HF \| CONTROLES` | Nulo con todos los controles del editable |
| `HF \| CTA` · `SUBTITULO` · `TITULO` | Bloque de texto con entrada escalonada |
| `HF \| ACENTO` | Barra vertical con el color de marca |
| `HF \| LOGO` | Marcador cuadrado, reemplazable por tu logo |
| `HF \| BARRA` | Lower third |
| `HF \| VINETA` | Viñeta con máscara elíptica |
| `HF \| LOOK` | Capa de ajuste (Niveles + Intensidad + Máscara de enfoque) |

**El metraje original no se toca**: se mueve al fondo y se bloquea.

### Controles

Todo cuelga de `HF | CONTROLES` y está expuesto en **Ventana > Gráficos
esenciales**: Escala UI · Retraso entrada · Duración entrada · Desplazamiento
entrada · Opacidad máxima · Viñeta · Color marca / texto / barra · Mostrar
barra / logo / CTA / guías.

Las animaciones de entrada son **expresiones, no fotogramas clave**: cambiar
retraso o duración re-temporiza todo el bloque sin tocar la timeline.

El script es **idempotente** — al re-ejecutarlo borra las capas `HF | ` previas y
reconstruye. Todo ocurre dentro de un grupo de deshacer: un `Ctrl/Cmd+Z` revierte
la operación completa.

## 2 · Traer assets de Higgsfield

1. Genera en Higgsfield y arma un manifiesto con las URLs resultantes
   (formato en `higgsfield/manifest.example.json`).
2. Descárgalos y reescribe el manifiesto con rutas locales:
   ```sh
   node higgsfield/descargar.mjs higgsfield/manifest.json
   ```
3. En AE: `ae/HF_ImportarAssets.jsx` → selecciona el manifiesto.

### Ranuras

| `slot` | Destino |
|---|---|
| `LOGO` | Reemplaza la fuente de `HF \| LOGO` |
| `FONDO` | Capa `HF \| FONDO` sobre el video base, escalada a cubrir |
| `BROLL` | `HF \| BROLL n` sobre el video base, respeta `start` y `duration` |
| `AUDIO` | `HF \| AUDIO n`, respeta `start` |

Cada entrada admite `url` (se descarga) o `file` (ruta relativa al manifiesto).

## Requisitos

- After Effects CC 2019 o superior (Gráficos esenciales por script)
- Node.js 18+ para `descargar.mjs` (usa `fetch` nativo)

## Notas de implementación

- Los `.jsx` son ExtendScript (ES3): sin `let`/`const`, sin arrow functions, sin
  `JSON` nativo. Van en ASCII puro con escapes `\uXXXX`, para que no dependan de
  la codificación con que se guarden.
- Las expresiones referencian los controles por **índice** (`effect("…")(1)`) y no
  por nombre de propiedad, para funcionar igual en AE en español y en inglés.
- El importador valida el manifiesto contra literales JSON antes de evaluarlo, en
  vez de pasar texto arbitrario a `eval`.
