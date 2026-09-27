/**
 * CCB_Adaptaciones.jsx  (After Effects)
 * ---------------------------------------------------------------------------
 * Arma el proyecto CM DIGITAL ECOMMERCE completo a partir de specs.json:
 *
 *   - importa PIEZA_01..03.ai (salida de CCB_PrepararPiezas.jsx) con capas
 *   - por cada medida de pantalla del CM crea una adaptacion con:
 *       MASTER    -> lo que se renderiza
 *         GUIAS     zonas de texto y QR (capa guia, no se renderiza)
 *         QR        solo en las medidas que lo llevan
 *         COPY      precomp con el copy del slide 28 como texto editable de AE
 *         ROTACION  precomp: las 3 piezas en loop, sin animar la imagen;
 *                   cada pieza entra con un fundido leve de opacidad
 *       PIEZA 0n  encuadre de cada pieza para esa medida: todas las capas del
 *                 .ai colgando de un nulo ENCUADRE (escala / posicion)
 *   - deja cada MASTER en la cola de render como MP4 (H.264) hacia 04_RENDER
 *   - guarda el .aep en 00_PROYECTO de la carpeta madre
 *
 * Nada se rasteriza: textos, capas del Illustrator y QR quedan editables.
 *
 * Uso: Archivo > Scripts > Ejecutar archivo de script... -> elige specs.json
 *
 * ExtendScript (ES3): sin let/const, sin arrow functions, sin JSON nativo.
 * Codigo 100% ASCII a proposito.
 */

(function CCBAdaptaciones() {

    var NOMBRE_CTRL = "CONTROLES";
    var EFECTO_FUNDIDO = "Fundido (s)";
    var CAPA_TEXTO_AI = "TEXTO_ORIGINAL";

    var avisos = [];
    var fuentesFaltantes = {};

    // ---------------------------------------------------------------------
    // Utilidades generales
    // ---------------------------------------------------------------------

    function leerArchivo(f) {
        f.encoding = "UTF-8";
        if (!f.open("r")) { return null; }
        var txt = f.read();
        f.close();
        return txt;
    }

    /* ExtendScript no trae JSON nativo. Validamos que el texto solo contenga
       literales antes de evaluarlo, para no ejecutar codigo arbitrario. */
    function parsearJSON(txt) {
        var limpio = txt
            .replace(/"(\\.|[^"\\])*"/g, "@")
            .replace(/[,:{}\[\]]/g, " ")
            .replace(/-?\d+(\.\d+)?([eE][+-]?\d+)?/g, " ")
            .replace(/\b(true|false|null)\b/g, " ")
            .replace(/@/g, " ");
        if (/\S/.test(limpio)) {
            throw new Error("specs.json no es JSON valido (contenido inesperado).");
        }
        return eval("(" + txt + ")");
    }

    function num(v, porDefecto) {
        return (typeof v === "number" && !isNaN(v)) ? v : porDefecto;
    }

    function dos(n) { return (n < 10 ? "0" : "") + n; }

    function limpiarNombre(s) {
        return String(s).replace(/[\\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
    }

    function crearCarpetaDisco(f) {
        if (f.exists) { return f; }
        if (f.parent && !f.parent.exists) { crearCarpetaDisco(f.parent); }
        f.create();
        return f;
    }

    function resolver(madre, ruta) {
        ruta = String(ruta);
        if (ruta.charAt(0) === "/" || ruta.charAt(0) === "~" || /^[A-Za-z]:/.test(ruta)) {
            return new File(ruta);
        }
        return new File(madre.fsName + "/" + ruta);
    }

    function copiar(obj) {
        var r = {};
        for (var k in obj) { if (obj.hasOwnProperty(k)) { r[k] = obj[k]; } }
        return r;
    }

    // ---------------------------------------------------------------------
    // Utilidades de After Effects
    // ---------------------------------------------------------------------

    function tr(capa) { return capa.property("ADBE Transform Group"); }
    function fx(capa) { return capa.property("ADBE Effect Parade"); }

    function carpetaAE(nombre, padre) {
        var f = app.project.items.addFolder(nombre);
        if (padre) { f.parentFolder = padre; }
        return f;
    }

    function nuevaComp(nombre, W, H, D, fps, carpeta) {
        var c = app.project.items.addComp(nombre, W, H, 1, D, fps);
        c.parentFolder = carpeta;
        return c;
    }

    function cuadro(t, fps) { return Math.round(t * fps) / fps; }

    function importarFootage(archivo, carpeta) {
        var io = new ImportOptions(archivo);
        try { io.importAs = ImportAsType.FOOTAGE; } catch (e) {}
        var it = app.project.importFile(io);
        it.parentFolder = carpeta;
        return it;
    }

    /* Importa un .ai como composicion con capas y ordena sus fuentes. */
    function importarAI(archivo, carpetaFuentes) {
        var io = new ImportOptions(archivo);
        if (!io.canImportAs(ImportAsType.COMP)) {
            throw new Error(archivo.name + " no se puede importar con capas " +
                            "(guardalo con compatibilidad PDF).");
        }
        io.importAs = ImportAsType.COMP;
        var comp = app.project.importFile(io);
        var raiz = app.project.rootFolder.id;
        for (var i = 1; i <= comp.numLayers; i++) {
            var s = comp.layer(i).source;
            if (s && s.parentFolder && s.parentFolder.id !== raiz &&
                s.parentFolder.id !== carpetaFuentes.id) {
                s.parentFolder.name = comp.name.replace(/\.ai$/i, "") + " (capas)";
                s.parentFolder.parentFolder = carpetaFuentes;
                break;
            }
        }
        return comp;
    }

    function esCapaTextoAI(capa) {
        var n = String(capa.name) + " " + (capa.source ? String(capa.source.name) : "");
        return n.indexOf(CAPA_TEXTO_AI) >= 0;
    }

    function extenderComp(comp, D) {
        comp.duration = D;
        for (var i = 1; i <= comp.numLayers; i++) {
            try { comp.layer(i).outPoint = D; } catch (e) {}
        }
    }

    function copiarTransformacion(origen, destino) {
        var props = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale",
                     "ADBE Rotate Z", "ADBE Opacity"];
        for (var i = 0; i < props.length; i++) {
            try { tr(destino).property(props[i]).setValue(tr(origen).property(props[i]).value); }
            catch (e) {}
        }
        try { destino.blendingMode = origen.blendingMode; } catch (eB) {}
    }

    function rectGuia(contenedor, x, y, w, h, rgb) {
        var g = contenedor.addProperty("ADBE Vector Group");
        var c = g.property("ADBE Vectors Group");
        var r = c.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue([w, h]);
        r.property("ADBE Vector Rect Position").setValue([x + w / 2, y + h / 2]);
        var st = c.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Color").setValue([rgb[0], rgb[1], rgb[2], 1]);
        st.property("ADBE Vector Stroke Width").setValue(Math.max(2, Math.round(Math.min(w, h) * 0.01)));
        return g;
    }

    // ---------------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------------

    function claseDeAspecto(W, H) {
        var ar = W / H;
        if (ar >= 3) { return "panoramico"; }
        if (ar >= 1.2) { return "horizontal"; }
        if (ar > 0.83) { return "cuadrado"; }
        return "vertical";
    }

    function layoutPara(specs, fmt, W, H) {
        var clase = fmt.clase || claseDeAspecto(W, H);
        var base = specs.layouts[clase];
        if (!base) { throw new Error("specs.json no define el layout \"" + clase + "\"."); }
        var lay = copiar(base);
        if (fmt.layout) {
            for (var k in fmt.layout) {
                if (fmt.layout.hasOwnProperty(k)) { lay[k] = fmt.layout[k]; }
            }
        }
        lay.clase = clase;
        return lay;
    }

    // ---------------------------------------------------------------------
    // Copy (texto editable de AE)
    // ---------------------------------------------------------------------

    var JUST = {
        izquierda: ParagraphJustification.LEFT_JUSTIFY,
        centro: ParagraphJustification.CENTER_JUSTIFY,
        derecha: ParagraphJustification.RIGHT_JUSTIFY
    };

    function aplicarEstilo(capa, est, tam, alinear) {
        var p = capa.property("ADBE Text Properties").property("ADBE Text Document");
        var td = p.value;
        if (est.fuente) { try { td.font = est.fuente; } catch (eF) {} }
        td.fontSize = tam;
        td.applyFill = true;
        var c = est.color || [1, 1, 1];
        td.fillColor = [c[0], c[1], c[2]];
        td.applyStroke = false;
        td.justification = JUST[alinear] || JUST.izquierda;
        try { td.tracking = num(est.tracking, 0); } catch (eT) {}
        if (est.mayusculas) { try { td.allCaps = true; } catch (eC) {} }
        if (est.interlineado) {
            try { td.autoLeading = false; } catch (eA) {}
            try { td.leading = tam * est.interlineado; } catch (eL) {}
        }
        p.setValue(td);
        if (est.fuente && p.value.font !== est.fuente) { fuentesFaltantes[est.fuente] = true; }
    }

    /* Crea los bloques de copy dentro de la region y los ajusta para que quepan
       (solo reduce, nunca agranda). Devuelve la region usada, en px. */
    function construirCopy(comp, specs, lay, conQR) {
        var W = comp.width;
        var H = comp.height;
        var reg = conQR ? lay.texto : (lay.textoSinQR || lay.texto);
        var rx = reg[0] * W, ry = reg[1] * H, rw = reg[2] * W, rh = reg[3] * H;
        var sep = num(lay.separacion, 0.04) * rh;
        var alinear = lay.alinear || "izquierda";
        var bloques = specs.copy;
        var capas = [];
        var i, r, k = 1;

        for (i = 0; i < bloques.length; i++) {
            var txt = String(bloques[i].texto).replace(/\r\n|\n/g, "\r");
            var L = comp.layers.addText(txt);
            L.name = bloques[i].id || ("COPY " + (i + 1));
            L.comment = "Copy slide 28 (" + (bloques[i].rol || "texto") + ")";
            L.moveToEnd();
            capas.push(L);
        }

        function aplicar(factor) {
            for (var j = 0; j < capas.length; j++) {
                var est = specs.estilos[bloques[j].rol] || {};
                aplicarEstilo(capas[j], est, Math.max(1, rh * num(est.tamano, 0.1) * factor), alinear);
            }
        }

        function medir() {
            var anchoMax = 0, alto = 0;
            for (var j = 0; j < capas.length; j++) {
                var rc = capas[j].sourceRectAtTime(0, false);
                anchoMax = Math.max(anchoMax, rc.width);
                alto += rc.height;
            }
            return { ancho: anchoMax, alto: alto + sep * k * (capas.length - 1) };
        }

        for (var iter = 0; iter < 6; iter++) {
            aplicar(k);
            var m = medir();
            if (!m.ancho || !m.alto) { break; }
            var f = Math.min(rw / m.ancho, rh / m.alto);
            if (f >= 1) { break; }
            k *= f * 0.98;
        }

        var total = medir().alto;
        var cursor = ry;
        if (lay.vertical === "centro") { cursor = ry + (rh - total) / 2; }
        else if (lay.vertical === "abajo") { cursor = ry + rh - total; }

        for (i = 0; i < capas.length; i++) {
            r = capas[i].sourceRectAtTime(0, false);
            var x;
            if (alinear === "centro") { x = rx + rw / 2 - (r.left + r.width / 2); }
            else if (alinear === "derecha") { x = rx + rw - (r.left + r.width); }
            else { x = rx - r.left; }
            tr(capas[i]).property("ADBE Position").setValue([x, cursor - r.top]);
            cursor += r.height + sep * k;
        }

        if (k < 0.999) {
            avisos.push(comp.name + ": el copy se redujo al " + Math.round(k * 100) +
                        "% para caber en la zona de texto.");
        }
        return [rx, ry, rw, rh];
    }

    // ---------------------------------------------------------------------
    // Piezas, rotacion y master
    // ---------------------------------------------------------------------

    /* Encuadre de una pieza para una medida: todas las capas del .ai, cada una
       editable, colgando de un nulo que cubre la pantalla. */
    function crearPiezaFormato(arte, idPieza, etiqueta, W, H, D, fps, carpeta, fmt) {
        var c = nuevaComp(etiqueta + " | " + idPieza, W, H, D, fps, carpeta);
        var encuadre = c.layers.addNull(D);
        encuadre.name = "ENCUADRE";
        encuadre.comment = "Escala/posicion del arte en esta medida. " +
                           "Las capas del .ai cuelgan de aqui y se pueden mover sueltas.";
        tr(encuadre).property("ADBE Anchor Point").setValue([0, 0]);
        tr(encuadre).property("ADBE Position").setValue([0, 0]);

        for (var i = arte.numLayers; i >= 1; i--) {
            var src = arte.layer(i);
            if (!src.source) { continue; }
            var L = c.layers.add(src.source);
            L.name = src.name;
            L.startTime = 0;
            L.outPoint = D;
            copiarTransformacion(src, L);
            L.enabled = esCapaTextoAI(src) ? false : src.enabled;
            L.parent = encuadre;
        }
        encuadre.moveToBeginning();

        var zoom = num(fmt.zoom, 1);
        var foco = fmt.foco || [0.5, 0.5];
        var k = (fmt.encuadre === "contener")
            ? Math.min(W / arte.width, H / arte.height) * zoom
            : Math.max(W / arte.width, H / arte.height) * zoom;
        tr(encuadre).property("ADBE Scale").setValue([k * 100, k * 100]);
        tr(encuadre).property("ADBE Position").setValue(
            [(W - arte.width * k) * foco[0], (H - arte.height * k) * foco[1]]);
        return c;
    }

    /* Loop sin animar la imagen: cada pieza queda fija D/n segundos y la
       siguiente entra encima con un fundido leve. Al final vuelve a entrar la
       PIEZA 01 para que el corte del loop tampoco se note. */
    function crearRotacion(piezas, etiqueta, W, H, D, fps, fundido, carpeta) {
        var c = nuevaComp(etiqueta + " | ROTACION", W, H, D, fps, carpeta);
        var n = piezas.length;
        var slot = D / n;
        var F = Math.min(fundido, slot / 2);

        var expr =
            "var f = thisComp.layer(\"" + NOMBRE_CTRL + "\").effect(\"" + EFECTO_FUNDIDO + "\")(1);\n" +
            "f > 0 ? linear(time - inPoint, 0, f, 0, 100) : 100;";

        function colocar(pieza, nombre, entrada, salida, conFundido) {
            var L = c.layers.add(pieza);
            L.name = nombre;
            L.startTime = entrada;
            L.inPoint = entrada;
            L.outPoint = salida;
            if (conFundido) { tr(L).property("ADBE Opacity").expression = expr; }
            return L;
        }

        for (var i = 0; i < n; i++) {
            var entrada = (i === 0) ? 0 : cuadro(i * slot - F, fps);
            var salida = (i === n - 1) ? D : cuadro((i + 1) * slot, fps);
            colocar(piezas[i], "PIEZA " + dos(i + 1), entrada, salida, i > 0);
        }
        if (F > 0 && n > 1) {
            colocar(piezas[0], "PIEZA 01 (cierre del loop)", cuadro(D - F, fps), D, true);
        }

        var ctrl = c.layers.addNull(D);
        ctrl.name = NOMBRE_CTRL;
        var s = fx(ctrl).addProperty("ADBE Slider Control");
        s.name = EFECTO_FUNDIDO;
        s.property(1).setValue(F);
        ctrl.comment = "Cada pieza dura " + (Math.round(slot * 100) / 100) +
                       " s en pantalla. Fundido: duracion del cambio de opacidad al entrar.";
        ctrl.moveToBeginning();
        return c;
    }

    function colocarQR(master, qrItem, lay) {
        var W = master.width, H = master.height;
        var q = lay.qr;
        var lado = q[2] * Math.min(W, H);
        var L;
        if (qrItem) {
            L = master.layers.add(qrItem);
            var k = lado / Math.max(qrItem.width, qrItem.height) * 100;
            tr(L).property("ADBE Scale").setValue([k, k]);
        } else {
            L = master.layers.addSolid([1, 1, 1], "QR (REEMPLAZAR)", Math.round(lado),
                                       Math.round(lado), 1, master.duration);
            L.comment = "Marcador: selecciona la capa y Alt+arrastra el QR desde el Proyecto.";
        }
        L.name = qrItem ? "QR" : "QR (REEMPLAZAR)";
        tr(L).property("ADBE Position").setValue([q[0] * W + lado / 2, q[1] * H + lado / 2]);
        return [q[0] * W, q[1] * H, lado, lado];
    }

    function configurarMP4(om, archivo) {
        var plantillas = om.templates;
        var elegida = null;
        for (var i = 0; i < plantillas.length; i++) {
            if (/H\.?264/i.test(plantillas[i])) {
                if (!elegida || /15/.test(plantillas[i])) { elegida = plantillas[i]; }
            }
        }
        var ok = false;
        if (elegida) {
            try { om.applyTemplate(elegida); ok = true; } catch (eT) {}
        }
        if (!ok) {
            try { om.setSettings({ "Format": "H.264" }); ok = true; } catch (eS) {}
        }
        om.file = archivo;
        return ok;
    }

    // ---------------------------------------------------------------------
    // Validacion de specs
    // ---------------------------------------------------------------------

    function validar(specs, madre) {
        var errores = [];
        var i;
        if (!specs.piezas || !specs.piezas.length) { errores.push("No hay piezas en \"piezas\"."); }
        else {
            for (i = 0; i < specs.piezas.length; i++) {
                if (!resolver(madre, specs.piezas[i].archivo).exists) {
                    errores.push("No existe " + specs.piezas[i].archivo +
                                 " (corre antes CCB_PrepararPiezas.jsx en Illustrator).");
                }
            }
        }
        if (!specs.copy || !specs.copy.length) { errores.push("No hay bloques en \"copy\"."); }
        if (!specs.layouts) { errores.push("Falta \"layouts\"."); }
        if (!specs.formatos || !specs.formatos.length) { errores.push("No hay \"formatos\"."); }
        return errores;
    }

    function medidaValida(v) { return v === "arte" || (typeof v === "number" && v > 0); }

    // ---------------------------------------------------------------------
    // Ejecucion
    // ---------------------------------------------------------------------

    var archivoSpecs = File.openDialog("Selecciona specs.json", "*.json");
    if (!archivoSpecs) { return; }

    var texto = leerArchivo(archivoSpecs);
    if (!texto) { alert("No pude leer " + archivoSpecs.fsName); return; }

    var specs;
    try { specs = parsearJSON(texto); }
    catch (ePar) { alert("specs.json invalido:\n" + ePar.toString()); return; }

    var madre = specs.carpetaMadre ? new Folder(specs.carpetaMadre) : null;
    if (!madre || !madre.exists) {
        madre = Folder.selectDialog("Selecciona la carpeta madre (CM DIGITAL ECOMMERCE)");
    }
    if (!madre) { return; }

    var errores = validar(specs, madre);
    if (errores.length) { alert("No se puede armar el proyecto:\n\n- " + errores.join("\n- ")); return; }

    if (app.project && app.project.numItems > 0 &&
        !confirm("Se creara un proyecto nuevo de After Effects. Continuar?")) {
        return;
    }
    if (!app.newProject()) { return; }

    var fps = num(specs.fps, 30);
    var fundido = num(specs.fundido, 0.5);
    var durDefecto = num(specs.duracionPorDefecto, 30);

    var dirProyecto = crearCarpetaDisco(new Folder(madre.fsName + "/00_PROYECTO"));
    var dirRender = crearCarpetaDisco(new Folder(madre.fsName + "/04_RENDER"));

    app.beginUndoGroup("CM Digital Ecommerce - adaptaciones");

    var construidos = [];
    var pendientes = [];

    try {
        var fFuentes = carpetaAE("01_FUENTES", null);
        var fAI = carpetaAE("AI", fFuentes);
        var fQR = carpetaAE("QR", fFuentes);
        var fPiezas = carpetaAE("02_PIEZAS", null);
        var fAdapt = carpetaAE("03_ADAPTACIONES", null);

        // -- Duracion maxima, para que el arte alcance en todas las medidas --
        var durMax = durDefecto;
        var i;
        for (i = 0; i < specs.formatos.length; i++) {
            durMax = Math.max(durMax, num(specs.formatos[i].duracion, durDefecto));
        }

        // -- Piezas del Illustrator --------------------------------------
        var artes = [];
        for (i = 0; i < specs.piezas.length; i++) {
            var pz = specs.piezas[i];
            var arte = importarAI(resolver(madre, pz.archivo), fAI);
            arte.name = pz.id + " | ARTE AI";
            arte.parentFolder = fPiezas;
            arte.frameRate = fps;
            extenderComp(arte, durMax);
            for (var j = 1; j <= arte.numLayers; j++) {
                if (esCapaTextoAI(arte.layer(j))) { arte.layer(j).enabled = false; }
            }
            arte.comment = "Arte original de " + pz.archivo + ". La capa " + CAPA_TEXTO_AI +
                           " (copy del .ai) queda apagada: el copy va en cada COPY.";
            artes.push(arte);
        }

        // -- QR --------------------------------------------------------------
        var qrItem = null;
        var hayQR = false;
        for (i = 0; i < specs.formatos.length; i++) {
            if (specs.formatos[i].qr === true && !specs.formatos[i].pendiente) { hayQR = true; }
        }
        if (hayQR) {
            var archivoQR = specs.qr ? resolver(madre, specs.qr) : null;
            if (archivoQR && archivoQR.exists) { qrItem = importarFootage(archivoQR, fQR); }
            else { avisos.push("No encontre el QR (" + specs.qr + "): quedo un marcador blanco."); }
        }

        // -- Adaptaciones --------------------------------------------------
        for (i = 0; i < specs.formatos.length; i++) {
            var fmt = specs.formatos[i];
            if (fmt.pendiente) { pendientes.push(fmt.nombre); continue; }
            if (!medidaValida(fmt.ancho) || !medidaValida(fmt.alto)) {
                pendientes.push(fmt.nombre + " (sin medida)");
                continue;
            }

            var W = (fmt.ancho === "arte") ? artes[0].width : Math.round(fmt.ancho);
            var H = (fmt.alto === "arte") ? artes[0].height : Math.round(fmt.alto);
            var D = num(fmt.duracion, durDefecto);
            var conQR = fmt.qr === true;
            var etiqueta = dos(i + 1) + " " + limpiarNombre(fmt.nombre) + " " + W + "x" + H;
            var lay = layoutPara(specs, fmt, W, H);

            if (W % 2 || H % 2) {
                avisos.push(etiqueta + ": H.264 exige ancho y alto pares; revisa la medida.");
            }

            var fFmt = carpetaAE(etiqueta, fAdapt);
            var fFmtPiezas = carpetaAE("piezas", fFmt);

            var piezasFmt = [];
            for (var p = 0; p < artes.length; p++) {
                piezasFmt.push(crearPiezaFormato(artes[p], specs.piezas[p].id, etiqueta,
                                                 W, H, D, fps, fFmtPiezas, fmt));
            }
            var rot = crearRotacion(piezasFmt, etiqueta, W, H, D, fps,
                                    num(fmt.fundido, fundido), fFmt);

            var copyComp = nuevaComp(etiqueta + " | COPY", W, H, D, fps, fFmt);
            var zonaTexto = construirCopy(copyComp, specs, lay, conQR);

            var master = nuevaComp(etiqueta + " | MASTER", W, H, D, fps, fFmt);
            master.comment = "Medida " + W + "x" + H + " - " + D + " s - " +
                             (conQR ? "con QR" : "sin QR") + " - layout " + lay.clase +
                             (fmt.slide ? " - slide " + fmt.slide : "");
            var capaRot = master.layers.add(rot);
            capaRot.name = "ROTACION (" + artes.length + " piezas)";
            var capaCopy = master.layers.add(copyComp);
            capaCopy.name = "COPY";

            var guias = master.layers.addShape();
            guias.name = "GUIAS (no se renderiza)";
            var raiz = guias.property("ADBE Root Vectors Group");
            rectGuia(raiz, zonaTexto[0], zonaTexto[1], zonaTexto[2], zonaTexto[3], [1, 0.7, 0]);
            if (conQR) {
                var zonaQR = colocarQR(master, qrItem, lay);
                rectGuia(raiz, zonaQR[0], zonaQR[1], zonaQR[2], zonaQR[3], [0, 1, 0.4]);
            }
            tr(guias).property("ADBE Anchor Point").setValue([0, 0]);
            tr(guias).property("ADBE Position").setValue([0, 0]);
            guias.guideLayer = true;
            guias.moveToBeginning();

            // -- Render ---------------------------------------------------------
            var rq = app.project.renderQueue.items.add(master);
            var salida = new File(dirRender.fsName + "/" + etiqueta.replace(/ /g, "_") +
                                  "_" + D + "s.mp4");
            if (!configurarMP4(rq.outputModule(1), salida)) {
                avisos.push(etiqueta + ": no encontre la salida H.264 en esta version de AE; " +
                            "usa Composicion > Anadir a la cola de Adobe Media Encoder.");
            }

            construidos.push(etiqueta + " - " + D + " s - " + (conQR ? "QR" : "sin QR"));
        }

        // -- Guardar -----------------------------------------------------------
        var base = limpiarNombre(specs.proyecto || "CM DIGITAL ECOMMERCE").replace(/ /g, "_");
        var v = 1;
        var aep = new File(dirProyecto.fsName + "/" + base + "_v" + dos(v) + ".aep");
        while (aep.exists) {
            v++;
            aep = new File(dirProyecto.fsName + "/" + base + "_v" + dos(v) + ".aep");
        }
        app.project.save(aep);

        var faltan = [];
        for (var nf in fuentesFaltantes) { if (fuentesFaltantes.hasOwnProperty(nf)) { faltan.push(nf); } }
        if (faltan.length) {
            avisos.push("Fuentes no instaladas (AE uso otra): " + faltan.join(", "));
        }

        var msg = "Proyecto guardado en:\n" + aep.fsName + "\n\n" +
                  "Adaptaciones (" + construidos.length + "):\n- " + construidos.join("\n- ");
        if (pendientes.length) { msg += "\n\nPendientes en specs.json:\n- " + pendientes.join("\n- "); }
        if (avisos.length) { msg += "\n\nAvisos:\n- " + avisos.join("\n- "); }
        msg += "\n\nRevisa la cola de render y dale Procesar para generar los MP4 en 04_RENDER.";
        alert(msg);

    } catch (err) {
        alert("Error en la linea " + err.line + ":\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }

})();
