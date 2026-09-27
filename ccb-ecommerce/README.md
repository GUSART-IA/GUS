# CM DIGITAL ECOMMERCE · Adaptaciones del KV

Toma las **3 piezas horizontales** del Illustrator y arma, por cada medida de
pantalla del CM, un **video loop MP4** donde las piezas se turnan sin animarse:
cada una queda fija en pantalla y la siguiente entra con un fundido leve de
opacidad. Todas llevan el **copy del slide 28**; las medidas sin QR no lo llevan
y el texto ocupa ese espacio.

## Flujo

1. **Illustrator** con el `.ai` abierto y guardado →
   `illustrator/CCB_PrepararPiezas.jsx` → elige la carpeta madre.
   No toca el original. Crea en `01_FUENTES/AI/`:
   - `PIEZA_01.ai` … `PIEZA_03.ai`: una mesa por archivo, capas intactas, texto
     vivo movido a la capa `TEXTO_ORIGINAL`
   - `preview/*.png` e `inventario.json` (mesas, capas, textos, fuentes, colores)
2. Copia el QR a `01_FUENTES/QR/QR.png` y `specs.json` a `00_PROYECTO/`.
3. **After Effects** → `ae/CCB_Adaptaciones.jsx` → elige `specs.json`.
   Crea un proyecto nuevo, lo arma completo, deja todo en la cola de render
   y guarda `00_PROYECTO/CM_DIGITAL_ECOMMERCE_v01.aep` (nunca sobrescribe).
4. Cola de render → **Procesar** → los MP4 quedan en `04_RENDER/`.

## Carpeta madre

```
CM DIGITAL ECOMMERCE/
├── 00_PROYECTO/     .aep versionados + specs.json
├── 01_FUENTES/
│   ├── AI/          PIEZA_0n.ai, preview/, inventario.json
│   └── QR/
└── 04_RENDER/       <nn>_<MEDIO>_<ancho>x<alto>_<dur>s.mp4
```

## Proyecto de After Effects

```
01_FUENTES / AI (capas de cada .ai) · QR
02_PIEZAS  / PIEZA_0n | ARTE AI               arte original, sin copy
03_ADAPTACIONES /
   <nn> <MEDIO> <W>x<H> /
      … | MASTER        ← se renderiza
          GUIAS           zona de texto (naranja) y QR (verde), no se renderiza
          QR              solo si la medida lo lleva
          COPY            precomp: TITULAR, BAJADA, LEGAL… texto editable
          ROTACION        precomp: las 3 piezas en loop
      … | ROTACION      nulo CONTROLES → "Fundido (s)"
      … | COPY
      piezas / … | PIEZA_0n  todas las capas del .ai colgando de ENCUADRE
```

- **Reencuadrar el arte** en una medida: mueve o escala el nulo `ENCUADRE` de
  su `PIEZA_0n`. Las capas del `.ai` se pueden mover sueltas en esa medida
  sin afectar a las demás.
- **Tiempo en pantalla** = duración de la medida / 3 (30 s → 10 s por pieza).
  Al final vuelve a entrar la PIEZA 01, así el corte del loop no se nota.
- **Copy**: texto de AE. Se ajusta solo para caber en su zona (solo se
  reduce, nunca se agranda) y avisa cuando lo reduce.

## specs.json

| Campo | Qué es |
|---|---|
| `copy` | Bloques del slide 28 (`\r` = salto de línea) y su `rol` |
| `estilos.<rol>` | `fuente` (nombre PostScript), `color` RGB 0–1, `tamano` (fracción del alto de la zona de texto), `interlineado`, `tracking`, `mayusculas` |
| `layouts.<clase>` | Zonas en fracciones de la pantalla: `texto` y `textoSinQR` = `[x, y, ancho, alto]`; `qr` = `[x, y, lado]` (lado relativo al lado corto) |
| `formatos[]` | `nombre`, `ancho`/`alto` en px (o `"arte"`), `duracion` (sin dato → 30 s), `qr`, `slide` |
| por formato | `clase`, `layout` (sobrescribe zonas), `foco` `[x, y]` 0–1, `zoom`, `encuadre` (`cubrir` / `contener`), `fundido`, `pendiente` |

La clase se elige por proporción: `panoramico` ≥ 3:1 · `horizontal` ≥ 1.2 ·
`cuadrado` · `vertical` < 0.83. Los formatos con `"pendiente": true` se
listan pero no se arman.

> **Estado:** medidas, duraciones, copy y zonas de texto son **provisionales**
> hasta leer el CM (slides 28–36) y el inventario del `.ai`.

## Requisitos

- Illustrator CC · After Effects 2023 o superior (MP4/H.264 nativo en la cola
  de render; en versiones anteriores el script avisa y se exporta por Media
  Encoder)
- H.264 exige ancho y alto pares
