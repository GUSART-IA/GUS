/**
 * CCB_PrepararPiezas.jsx  (Illustrator)
 * ---------------------------------------------------------------------------
 * Prepara el .ai de las piezas horizontales para After Effects, SIN modificar
 * el archivo original.
 *
 * Por cada mesa de trabajo (= una pieza) genera en <carpeta madre>/01_FUENTES/AI:
 *   PIEZA_01.ai, PIEZA_02.ai, ...   una sola mesa, capas intactas, compatible
 *                                   con PDF (requisito para importar en AE).
 *                                   Todo el texto vivo se mueve a la capa
 *                                   TEXTO_ORIGINAL, que AE deja apagada: el
 *                                   copy final se monta como texto editable
 *                                   de AE (copy del slide 28).
 *   preview/PIEZA_0n.png            vista previa liviana de cada mesa
 *   inventario.json                 mesas, capas, textos, fuentes y colores
 *
 * Sube inventario.json y preview/ al repo: con eso se ajusta la diagramacion
 * sin tener que subir el .ai completo.
 *
 * Uso: con el .ai abierto y guardado ->
 *      Archivo > Secuencias de comandos > Otra secuencia de comandos...
 *
 * ExtendScript (ES3). Codigo 100% ASCII a proposito.
 */

(function CCBPrepararPiezas() {

    var CAPA_TEXTO = "TEXTO_ORIGINAL";
    var ANCHO_PREVIEW = 1600;

    // ---------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------

    function crearCarpeta(f) {
        if (f.exists) { return f; }
        if (f.parent && !f.parent.exists) { crearCarpeta(f.parent); }
        f.create();
        return f;
    }

    function dos(n) { return (n < 10 ? "0" : "") + n; }

    function redondear(n) { return Math.round(n * 100) / 100; }

    /* JSON a mano (ExtendScript no trae JSON). Salida ASCII con \uXXXX. */
    function comillas(s) {
        s = String(s);
        var out = "\"";
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var k = s.charCodeAt(i);
            if (c === "\"") { out += "\\\""; }
            else if (c === "\\") { out += "\\\\"; }
            else if (c === "\n") { out += "\\n"; }
            else if (c === "\r") { out += "\\r"; }
            else if (c === "\t") { out += "\\t"; }
            else if (k < 32 || k > 126) {
                var h = k.toString(16);
                while (h.length < 4) { h = "0" + h; }
                out += "\\u" + h;
            } else { out += c; }
        }
        return out + "\"";
    }

    function aJSON(v, sangria) {
        sangria = sangria || "";
        var sig = sangria + "  ";
        var partes = [];
        var i;
        if (v === null || v === undefined) { return "null"; }
        if (typeof v === "number") { return isFinite(v) ? String(v) : "null"; }
        if (typeof v === "boolean") { return v ? "true" : "false"; }
        if (typeof v === "string") { return comillas(v); }
        if (v instanceof Array) {
            if (!v.length) { return "[]"; }
            for (i = 0; i < v.length; i++) { partes.push(sig + aJSON(v[i], sig)); }
            return "[\n" + partes.join(",\n") + "\n" + sangria + "]";
        }
        for (var k in v) {
            if (v.hasOwnProperty(k)) { partes.push(sig + comillas(k) + ": " + aJSON(v[k], sig)); }
        }
        if (!partes.length) { return "{}"; }
        return "{\n" + partes.join(",\n") + "\n" + sangria + "}";
    }

    function escribir(f, txt) {
        f.encoding = "UTF-8";
        if (!f.open("w")) { return false; }
        f.write(txt);
        f.close();
        return true;
    }

    function textoColor(c) {
        if (!c) { return null; }
        try {
            switch (c.typename) {
                case "RGBColor":
                    return "rgb(" + Math.round(c.red) + "," + Math.round(c.green) + "," +
                           Math.round(c.blue) + ")";
                case "CMYKColor":
                    return "cmyk(" + Math.round(c.cyan) + "," + Math.round(c.magenta) + "," +
                           Math.round(c.yellow) + "," + Math.round(c.black) + ")";
                case "GrayColor":
                    return "gray(" + Math.round(c.gray) + ")";
                case "SpotColor":
                    return "spot(" + c.spot.name + ")";
                case "NoColor":
                    return null;
                default:
                    return c.typename;
            }
        } catch (e) { return null; }
    }

    /* Rect de Illustrator: [izq, arriba, der, abajo], con Y hacia arriba. */
    function seTocan(a, b) {
        return a[0] < b[2] && a[2] > b[0] && a[1] > b[3] && a[3] < b[1];
    }

    function mesaDelPunto(doc, x, y) {
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            if (x >= r[0] && x <= r[2] && y <= r[1] && y >= r[3]) { return i; }
        }
        return -1;
    }

    function nombreCapa(item) {
        var p = item.parent;
        while (p && p.typename !== "Layer") { p = p.parent; }
        return p ? p.name : null;
    }

    // ---------------------------------------------------------------------
    // Inventario (solo lectura)
    // ---------------------------------------------------------------------

    function arbolCapas(capas) {
        var res = [];
        for (var i = 0; i < capas.length; i++) {
            var L = capas[i];
            var nodo = {
                nombre: L.name,
                visible: L.visible,
                bloqueada: L.locked,
                elementos: L.pageItems.length
            };
            if (L.layers.length) { nodo.subcapas = arbolCapas(L.layers); }
            res.push(nodo);
        }
        return res;
    }

    function inventario(doc) {
        var inv = {
            documento: doc.name,
            espacioColor: (doc.documentColorSpace === DocumentColorSpace.CMYK) ? "CMYK" : "RGB",
            unidades: "pt (1 pt = 1 px al importar en AE)",
            mesas: [],
            capas: arbolCapas(doc.layers),
            textos: [],
            imagenes: { enlazadas: doc.placedItems.length, incrustadas: doc.rasterItems.length }
        };
        var i;

        for (i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            inv.mesas.push({
                pieza: "PIEZA_" + dos(i + 1),
                nombre: doc.artboards[i].name,
                ancho: redondear(r[2] - r[0]),
                alto: redondear(r[1] - r[3])
            });
        }

        for (i = 0; i < doc.textFrames.length; i++) {
            var tf = doc.textFrames[i];
            var b = tf.visibleBounds;
            var m = mesaDelPunto(doc, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
            var ref = (m >= 0) ? doc.artboards[m].artboardRect : [0, 0, 0, 0];
            var t = { pieza: (m >= 0) ? "PIEZA_" + dos(m + 1) : null, capa: nombreCapa(tf),
                      contenido: tf.contents,
                      x: redondear(b[0] - ref[0]), y: redondear(ref[1] - b[1]),
                      ancho: redondear(b[2] - b[0]), alto: redondear(b[1] - b[3]) };
            try {
                var ca = tf.textRange.characterAttributes;
                t.fuente = ca.textFont.name;
                t.familia = ca.textFont.family;
                t.estilo = ca.textFont.style;
                t.tamano = redondear(ca.size);
                t.tracking = ca.tracking;
                t.color = textoColor(ca.fillColor);
            } catch (eT) { /* texto sin atributos legibles */ }
            try {
                var j = tf.textRange.paragraphAttributes.justification;
                t.alineacion = String(j).replace("Justification.", "");
            } catch (eJ) {}
            inv.textos.push(t);
        }
        return inv;
    }

    function exportarPreviews(doc, carpeta) {
        var original = doc.artboards.getActiveArtboardIndex();
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            var ancho = r[2] - r[0];
            var esc = Math.min(100, ANCHO_PREVIEW / ancho * 100);
            doc.artboards.setActiveArtboardIndex(i);
            var o = new ExportOptionsPNG24();
            o.artBoardClipping = true;
            o.antiAliasing = true;
            o.transparency = false;
            o.horizontalScale = esc;
            o.verticalScale = esc;
            doc.exportFile(new File(carpeta.fsName + "/PIEZA_" + dos(i + 1) + ".png"),
                           ExportType.PNG24, o);
        }
        doc.artboards.setActiveArtboardIndex(original);
    }

    // ---------------------------------------------------------------------
    // Un .ai por mesa (trabaja sobre una copia en disco)
    // ---------------------------------------------------------------------

    function capasPlanas(capas, acc) {
        for (var i = 0; i < capas.length; i++) {
            acc.push(capas[i]);
            capasPlanas(capas[i].layers, acc);
        }
        return acc;
    }

    function aislarMesa(d, indice) {
        var rect = d.artboards[indice].artboardRect;
        var capas = capasPlanas(d.layers, []);
        var estado = [];
        var i, j;

        for (i = 0; i < capas.length; i++) {
            estado.push({ v: capas[i].visible, l: capas[i].locked });
            capas[i].visible = true;
            capas[i].locked = false;
        }

        for (i = 0; i < capas.length; i++) {
            var items = capas[i].pageItems;
            for (j = items.length - 1; j >= 0; j--) {
                var it = items[j];
                if (it.parent.typename !== "Layer") { continue; }
                if (!seTocan(it.visibleBounds, rect)) {
                    try { it.locked = false; it.remove(); } catch (eR) {}
                }
            }
        }

        for (j = d.artboards.length - 1; j >= 0; j--) {
            if (j !== indice) { d.artboards[j].remove(); }
        }

        for (i = 0; i < capas.length; i++) {
            try { capas[i].visible = estado[i].v; } catch (eV) {}
        }
    }

    /* Mueve el texto vivo a una capa propia, conservando el orden de apilado. */
    function separarTexto(d) {
        if (!d.textFrames.length) { return 0; }
        var capa = d.layers.add();
        capa.name = CAPA_TEXTO;
        var lista = [];
        var i;
        for (i = 0; i < d.textFrames.length; i++) { lista.push(d.textFrames[i]); }
        var movidos = 0;
        for (i = lista.length - 1; i >= 0; i--) {
            try {
                lista[i].locked = false;
                lista[i].move(capa, ElementPlacement.PLACEATBEGINNING);
                movidos++;
            } catch (eM) { /* texto dentro de un objeto que no se deja mover */ }
        }
        return movidos;
    }

    function opcionesAI() {
        var o = new IllustratorSaveOptions();
        o.pdfCompatible = true;          // AE solo importa .ai con compatibilidad PDF
        o.embedLinkedFiles = true;       // el .ai de cada pieza queda autocontenido
        o.compressed = true;
        o.saveMultipleArtboards = false;
        return o;
    }

    // ---------------------------------------------------------------------
    // Ejecucion
    // ---------------------------------------------------------------------

    if (app.documents.length === 0) {
        alert("Abre el .ai con las piezas horizontales antes de ejecutar el script.");
        return;
    }

    var doc = app.activeDocument;
    if (!doc.saved || !doc.path || String(doc.path) === "") {
        alert("Guarda el documento antes de ejecutar el script\n" +
              "(se trabaja sobre una copia del archivo en disco).");
        return;
    }

    var nMesas = doc.artboards.length;
    if (nMesas !== 3 && !confirm("El documento tiene " + nMesas + " mesas de trabajo " +
                                 "y se esperaban 3 piezas. Continuar igual?")) {
        return;
    }

    var madre = Folder.selectDialog("Selecciona la carpeta madre (CM DIGITAL ECOMMERCE)");
    if (!madre) { return; }

    var dirAI = crearCarpeta(new Folder(madre.fsName + "/01_FUENTES/AI"));
    var dirPrev = crearCarpeta(new Folder(dirAI.fsName + "/preview"));

    var avisos = [];

    // 1. Inventario y previews desde el original
    var inv = inventario(doc);
    if (inv.espacioColor === "CMYK") {
        avisos.push("El documento esta en CMYK: para pantalla conviene RGB " +
                    "(Archivo > Modo de color del documento > RGB) antes de exportar.");
    }
    exportarPreviews(doc, dirPrev);
    escribir(new File(dirAI.fsName + "/inventario.json"), aJSON(inv) + "\n");

    // 2. Un .ai por mesa
    var tmp = new File(dirAI.fsName + "/_temp_separar.ai");
    if (!(new File(doc.fullName)).copy(tmp)) {
        alert("No pude copiar el archivo original a " + tmp.fsName);
        return;
    }

    var creados = [];
    for (var i = 0; i < nMesas; i++) {
        var d = app.open(tmp);
        try {
            aislarMesa(d, i);
            var movidos = separarTexto(d);
            var destino = new File(dirAI.fsName + "/PIEZA_" + dos(i + 1) + ".ai");
            d.saveAs(destino, opcionesAI());
            creados.push(destino.name + "  (" + movidos + " textos en " + CAPA_TEXTO + ")");
        } catch (eP) {
            avisos.push("Mesa " + (i + 1) + ": " + eP.toString());
        } finally {
            d.close(SaveOptions.DONOTSAVECHANGES);
        }
    }
    tmp.remove();

    var msg = "Listo. En " + dirAI.fsName + ":\n\n- " + creados.join("\n- ") +
              "\n- inventario.json\n- preview/ (" + nMesas + " PNG)\n\n" +
              "Sube inventario.json y preview/ al repo para ajustar la diagramacion.";
    if (avisos.length) { msg += "\n\nAvisos:\n- " + avisos.join("\n- "); }
    alert(msg);

})();
