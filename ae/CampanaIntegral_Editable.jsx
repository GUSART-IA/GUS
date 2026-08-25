/**
 * CampanaIntegral_Editable.jsx
 * ---------------------------------------------------------------------------
 * Construye un "editable" (plantilla parametrica) encima del video que ya
 * existe en la composicion CAMPANA INTEGRAL, sin tocar el metraje original.
 *
 * Todo lo que crea queda:
 *   - prefijado con "HF | "  -> facil de identificar y de re-generar
 *   - controlado desde una sola capa nula ("HF | CONTROLES")
 *   - expuesto en Essential Graphics (Graficos esenciales) para editar sin
 *     entrar en la timeline
 *
 * Uso: Archivo > Scripts > Ejecutar archivo de script...  (o arrastrar aqui)
 *
 * ExtendScript (ES3): sin let/const, sin arrow functions, sin JSON nativo.
 * Codigo 100% ASCII a proposito, para que no dependa de la codificacion.
 */

(function CampanaIntegralEditable() {

    // ---------------------------------------------------------------------
    // Configuracion
    // ---------------------------------------------------------------------
    var COMP_OBJETIVO = "CAMPANA INTEGRAL";   // se compara sin acentos
    var P = "HF | ";                          // prefijo de todas las capas
    var NOMBRE_CTRL = P + "CONTROLES";

    var TXT_TITULO = "TITULAR DE CAMPANA";
    var TXT_SUBTITULO = "Bajada o claim secundario";
    var TXT_CTA = "www.tu-sitio.com";

    var COLOR_MARCA = [0.15, 0.55, 1.00];     // azul
    var COLOR_TEXTO = [1.00, 1.00, 1.00];
    var COLOR_BARRA = [0.05, 0.06, 0.09];

    // ---------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------

    function normalizar(s) {
        s = String(s).toUpperCase();
        var acentos = "\u00C1\u00C0\u00C4\u00C2\u00C9\u00C8\u00CB\u00CA" +
                      "\u00CD\u00CC\u00CF\u00CE\u00D3\u00D2\u00D6\u00D4" +
                      "\u00DA\u00D9\u00DC\u00DB\u00D1";
        var planos  = "AAAAEEEEIIIIOOOOUUUUN";
        var out = "";
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var k = acentos.indexOf(c);
            out += (k >= 0) ? planos.charAt(k) : c;
        }
        out = out.replace(/[\s\u00A0]+/g, " ");
        return out.replace(/^ +/, "").replace(/ +$/, "");
    }

    function todasLasComps() {
        var res = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem) { res.push(it); }
        }
        return res;
    }

    /* Busca la comp objetivo: coincidencia exacta -> parcial -> comp activa. */
    function buscarComp() {
        var comps = todasLasComps();
        var objetivo = normalizar(COMP_OBJETIVO);
        var i;

        for (i = 0; i < comps.length; i++) {
            if (normalizar(comps[i].name) === objetivo) { return comps[i]; }
        }
        for (i = 0; i < comps.length; i++) {
            if (normalizar(comps[i].name).indexOf("CAMPANA") >= 0) { return comps[i]; }
        }

        var activa = app.project.activeItem;
        if (activa && activa instanceof CompItem) {
            var ok = confirm(
                "No encontre la composicion \"" + COMP_OBJETIVO + "\".\n\n" +
                "Uso la composicion activa \"" + activa.name + "\"?");
            if (ok) { return activa; }
        }
        return null;
    }

    /* La capa de video base: la mas baja que sea metraje con imagen. */
    function buscarCapaVideo(comp) {
        for (var i = comp.numLayers; i >= 1; i--) {
            var L = comp.layer(i);
            if (!(L instanceof AVLayer)) { continue; }
            if (L.name.indexOf(P) === 0) { continue; }
            var src = L.source;
            if (!src) { continue; }
            if (src instanceof CompItem) { return L; }
            if (src instanceof FootageItem && src.hasVideo) { return L; }
        }
        return null;
    }

    function limpiarAnterior(comp) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            if (comp.layer(i).name.indexOf(P) === 0) {
                comp.layer(i).locked = false;
                comp.layer(i).remove();
                n++;
            }
        }
        return n;
    }

    function fx(capa) { return capa.property("ADBE Effect Parade"); }
    function tr(capa) { return capa.property("ADBE Transform Group"); }

    function addSlider(capa, nombre, valor) {
        var e = fx(capa).addProperty("ADBE Slider Control");
        e.name = nombre;
        e.property(1).setValue(valor);
        return e;
    }

    function addColor(capa, nombre, rgb) {
        var e = fx(capa).addProperty("ADBE Color Control");
        e.name = nombre;
        e.property(1).setValue([rgb[0], rgb[1], rgb[2], 1]);
        return e;
    }

    function addCheckbox(capa, nombre, on) {
        var e = fx(capa).addProperty("ADBE Checkbox Control");
        e.name = nombre;
        e.property(1).setValue(on ? 1 : 0);
        return e;
    }

    /* Expone una propiedad en Graficos esenciales, si la version lo soporta. */
    function aEGP(prop, comp, etiqueta) {
        try {
            if (prop.addToMotionGraphicsTemplateAs) {
                return prop.addToMotionGraphicsTemplateAs(comp, etiqueta);
            }
            if (prop.addToMotionGraphicsTemplate) {
                return prop.addToMotionGraphicsTemplate(comp);
            }
        } catch (e) { /* version antigua o propiedad no admitida */ }
        return false;
    }

    /* Referencia al control, para usar dentro de expresiones. */
    function ref(nombreEfecto) {
        return 'thisComp.layer("' + NOMBRE_CTRL + '").effect("' + nombreEfecto + '")(1)';
    }

    /* Expresion de entrada: fade + desplazamiento, sin un solo fotograma clave. */
    function expEntradaOpacidad(offset, checkbox) {
        var vis = checkbox ? (" * " + ref(checkbox)) : "";
        return [
            "var d = " + ref("Retraso entrada") + " + " + offset + ";",
            "var dur = Math.max(0.05, " + ref("Duracion entrada") + ");",
            "var t = time - (inPoint + d);",
            "ease(t, 0, dur, 0, " + ref("Opacidad maxima") + ")" + vis + ";"
        ].join("\n");
    }

    function expEntradaPosicion(offset) {
        return [
            "var d = " + ref("Retraso entrada") + " + " + offset + ";",
            "var dur = Math.max(0.05, " + ref("Duracion entrada") + ");",
            "var s = " + ref("Desplazamiento entrada") + ";",
            "var t = time - (inPoint + d);",
            "value + [ease(t, 0, dur, s, 0), 0];"
        ].join("\n");
    }

    function expEscalaUI() {
        return "var k = " + ref("Escala UI") + "; [k, k];";
    }

    function expColor(nombreEfecto) {
        return ref(nombreEfecto) + ";";
    }

    function crearTexto(comp, nombre, contenido, factorTam, color) {
        var L = comp.layers.addText(contenido);
        L.name = nombre;
        var src = L.property("ADBE Text Properties").property("ADBE Text Document");
        var td = src.value;
        td.fontSize = Math.round(comp.height * factorTam);
        td.applyFill = true;
        td.fillColor = color;
        td.applyStroke = false;
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        try { td.tracking = -10; } catch (e) {}
        src.setValue(td);
        return L;
    }

    function elipse(cx, cy, rx, ry) {
        var k = 0.5522847498;
        var s = new Shape();
        s.closed = true;
        s.vertices    = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
        s.inTangents  = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
        s.outTangents = [[ rx * k, 0], [0,  ry * k], [-rx * k, 0], [0, -ry * k]];
        return s;
    }

    function rectanguloGuia(contenedor, w, h, colorRGB, grosor) {
        var g = contenedor.addProperty("ADBE Vector Group");
        var c = g.property("ADBE Vectors Group");
        var r = c.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue([w, h]);
        var st = c.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Color").setValue([colorRGB[0], colorRGB[1], colorRGB[2], 1]);
        st.property("ADBE Vector Stroke Width").setValue(grosor);
        return g;
    }

    // ---------------------------------------------------------------------
    // Ejecucion
    // ---------------------------------------------------------------------

    if (!app.project) {
        alert("Abre un proyecto de After Effects antes de ejecutar el script.");
        return;
    }

    var comp = buscarComp();
    if (!comp) {
        alert("No encontre la composicion \"" + COMP_OBJETIVO + "\".\n\n" +
              "Abrela o renombrala y vuelve a ejecutar el script.");
        return;
    }

    var video = buscarCapaVideo(comp);
    if (!video) {
        alert("La composicion \"" + comp.name + "\" no tiene ninguna capa de " +
              "video utilizable como base.");
        return;
    }

    app.beginUndoGroup("Construir editable - " + comp.name);

    try {
        var borradas = limpiarAnterior(comp);

        var W = comp.width;
        var H = comp.height;
        var DUR = comp.duration;
        var margen = Math.round(W * 0.07);
        var base = Math.round(H * 0.78);   // linea base del bloque de texto

        // -- 1. Capa de controles -----------------------------------------
        var ctrl = comp.layers.addNull(DUR);
        ctrl.name = NOMBRE_CTRL;
        ctrl.guideLayer = true;
        ctrl.enabled = false;
        ctrl.moveToBeginning();

        var sEscala   = addSlider(ctrl, "Escala UI", 100);
        var sRetraso  = addSlider(ctrl, "Retraso entrada", 0.2);
        var sDuracion = addSlider(ctrl, "Duracion entrada", 0.8);
        var sDesplaz  = addSlider(ctrl, "Desplazamiento entrada", -Math.round(W * 0.04));
        var sOpMax    = addSlider(ctrl, "Opacidad maxima", 100);
        var sVineta   = addSlider(ctrl, "Vineta", 35);

        var cMarca = addColor(ctrl, "Color marca", COLOR_MARCA);
        var cTexto = addColor(ctrl, "Color texto", COLOR_TEXTO);
        var cBarra = addColor(ctrl, "Color barra", COLOR_BARRA);

        var kBarra  = addCheckbox(ctrl, "Mostrar barra", true);
        var kLogo   = addCheckbox(ctrl, "Mostrar logo", true);
        var kCTA    = addCheckbox(ctrl, "Mostrar CTA", true);
        var kGuias  = addCheckbox(ctrl, "Mostrar guias", false);

        // -- 2. Look (capa de ajuste) --------------------------------------
        var look = comp.layers.addSolid([1, 1, 1], P + "LOOK", W, H, 1, DUR);
        look.adjustmentLayer = true;
        var efectosLook = ["ADBE Easy Levels2", "ADBE Vibrance", "ADBE Unsharp Mask2"];
        for (var iL = 0; iL < efectosLook.length; iL++) {
            try { fx(look).addProperty(efectosLook[iL]); } catch (eL) {}
        }
        look.comment = "Correccion de color global: afecta solo a las capas de abajo.";

        // -- 3. Vineta ------------------------------------------------------
        var vineta = comp.layers.addSolid([0, 0, 0], P + "VINETA", W, H, 1, DUR);
        var mk = vineta.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.maskMode = MaskMode.SUBTRACT;
        mk.property("ADBE Mask Shape").setValue(elipse(W / 2, H / 2, W * 0.62, H * 0.62));
        mk.property("ADBE Mask Feather").setValue([Math.round(W * 0.18), Math.round(W * 0.18)]);
        tr(vineta).property("ADBE Opacity").expression = ref("Vineta") + ";";

        // -- 4. Barra inferior (lower third) --------------------------------
        var barra = comp.layers.addShape();
        barra.name = P + "BARRA";
        var raiz = barra.property("ADBE Root Vectors Group");
        var gBarra = raiz.addProperty("ADBE Vector Group");
        var cBarraCont = gBarra.property("ADBE Vectors Group");
        var rBarra = cBarraCont.addProperty("ADBE Vector Shape - Rect");
        var altoBarra = Math.round(H * 0.22);
        rBarra.property("ADBE Vector Rect Size").setValue([W, altoBarra]);
        rBarra.property("ADBE Vector Rect Position").setValue([W / 2, H - altoBarra / 2]);
        var fBarra = cBarraCont.addProperty("ADBE Vector Graphic - Fill");
        fBarra.property("ADBE Vector Fill Color").expression = expColor("Color barra");
        tr(barra).property("ADBE Anchor Point").setValue([0, 0]);
        tr(barra).property("ADBE Position").setValue([0, 0]);
        tr(barra).property("ADBE Opacity").expression =
            "var v = " + ref("Mostrar barra") + ";\n" +
            "var d = " + ref("Retraso entrada") + ";\n" +
            "var dur = Math.max(0.05, " + ref("Duracion entrada") + ");\n" +
            "ease(time - (inPoint + d), 0, dur, 0, 85) * v;";

        // -- 5. Acento de marca ---------------------------------------------
        var acento = comp.layers.addShape();
        acento.name = P + "ACENTO";
        var gAc = acento.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var cAc = gAc.property("ADBE Vectors Group");
        var rAc = cAc.addProperty("ADBE Vector Shape - Rect");
        var anchoAc = Math.round(W * 0.006);
        var altoAc = Math.round(H * 0.11);
        rAc.property("ADBE Vector Rect Size").setValue([anchoAc, altoAc]);
        rAc.property("ADBE Vector Rect Position").setValue(
            [margen - Math.round(W * 0.022), base - Math.round(altoAc * 0.62)]);
        var fAc = cAc.addProperty("ADBE Vector Graphic - Fill");
        fAc.property("ADBE Vector Fill Color").expression = expColor("Color marca");
        tr(acento).property("ADBE Anchor Point").setValue([0, 0]);
        tr(acento).property("ADBE Position").setValue([0, 0]);
        tr(acento).property("ADBE Opacity").expression = expEntradaOpacidad(0.05, null);

        // -- 6. Textos --------------------------------------------------------
        var titulo = crearTexto(comp, P + "TITULO", TXT_TITULO, 0.075, COLOR_TEXTO);
        tr(titulo).property("ADBE Position").setValue([margen, base]);
        tr(titulo).property("ADBE Position").expression = expEntradaPosicion(0.10);
        tr(titulo).property("ADBE Opacity").expression = expEntradaOpacidad(0.10, null);
        tr(titulo).property("ADBE Scale").expression = expEscalaUI();

        var subtitulo = crearTexto(comp, P + "SUBTITULO", TXT_SUBTITULO, 0.034, COLOR_TEXTO);
        tr(subtitulo).property("ADBE Position").setValue([margen, base + Math.round(H * 0.055)]);
        tr(subtitulo).property("ADBE Position").expression = expEntradaPosicion(0.22);
        tr(subtitulo).property("ADBE Opacity").expression = expEntradaOpacidad(0.22, null);
        tr(subtitulo).property("ADBE Scale").expression = expEscalaUI();

        var cta = crearTexto(comp, P + "CTA", TXT_CTA, 0.028, COLOR_MARCA);
        tr(cta).property("ADBE Position").setValue([margen, H - Math.round(H * 0.055)]);
        tr(cta).property("ADBE Position").expression = expEntradaPosicion(0.34);
        tr(cta).property("ADBE Opacity").expression = expEntradaOpacidad(0.34, "Mostrar CTA");
        tr(cta).property("ADBE Scale").expression = expEscalaUI();

        // -- 7. Marcador de logo ------------------------------------------------
        var ladoLogo = Math.round(H * 0.11);
        var logo = comp.layers.addSolid(COLOR_MARCA, P + "LOGO", ladoLogo, ladoLogo, 1, DUR);
        tr(logo).property("ADBE Position").setValue(
            [W - margen - ladoLogo / 2, margen + ladoLogo / 2]);
        tr(logo).property("ADBE Opacity").expression = expEntradaOpacidad(0.00, "Mostrar logo");
        tr(logo).property("ADBE Scale").expression = expEscalaUI();
        logo.comment = "Marcador: selecciona esta capa y Alt+arrastra tu logo desde el Proyecto.";

        // -- 8. Guias de seguridad ------------------------------------------------
        var guias = comp.layers.addShape();
        guias.name = P + "GUIAS";
        var rGuias = guias.property("ADBE Root Vectors Group");
        rectanguloGuia(rGuias, W * 0.90, H * 0.90, [0, 1, 0.4], 2);   // action safe
        rectanguloGuia(rGuias, W * 0.80, H * 0.80, [1, 0.7, 0], 2);   // title safe
        tr(guias).property("ADBE Anchor Point").setValue([0, 0]);
        tr(guias).property("ADBE Position").setValue([W / 2, H / 2]);
        tr(guias).property("ADBE Opacity").expression =
            ref("Mostrar guias") + " * 60;";
        guias.guideLayer = true;

        // -- 9. Orden de capas -----------------------------------------------------
        guias.moveToBeginning();
        ctrl.moveAfter(guias);
        cta.moveAfter(ctrl);
        subtitulo.moveAfter(cta);
        titulo.moveAfter(subtitulo);
        acento.moveAfter(titulo);
        logo.moveAfter(acento);
        barra.moveAfter(logo);
        vineta.moveAfter(barra);
        look.moveAfter(vineta);
        video.moveToEnd();
        video.locked = true;

        // -- 10. Graficos esenciales -------------------------------------------------
        try { comp.motionGraphicsTemplateName = "CAMPANA INTEGRAL - Editable"; } catch (eN) {}

        aEGP(titulo.property("ADBE Text Properties").property("ADBE Text Document"),
             comp, "Titular");
        aEGP(subtitulo.property("ADBE Text Properties").property("ADBE Text Document"),
             comp, "Bajada");
        aEGP(cta.property("ADBE Text Properties").property("ADBE Text Document"),
             comp, "CTA");
        aEGP(cMarca.property(1), comp, "Color marca");
        aEGP(cTexto.property(1), comp, "Color texto");
        aEGP(cBarra.property(1), comp, "Color barra");
        aEGP(sEscala.property(1), comp, "Escala UI");
        aEGP(sRetraso.property(1), comp, "Retraso entrada");
        aEGP(sDuracion.property(1), comp, "Duracion entrada");
        aEGP(sVineta.property(1), comp, "Vineta");
        aEGP(kBarra.property(1), comp, "Mostrar barra");
        aEGP(kLogo.property(1), comp, "Mostrar logo");
        aEGP(kCTA.property(1), comp, "Mostrar CTA");

        // El color del texto sigue al control de color de texto.
        var capasTexto = [titulo, subtitulo];
        for (var iT = 0; iT < capasTexto.length; iT++) {
            var anim = capasTexto[iT].property("ADBE Text Properties")
                                     .property("ADBE Text Animators")
                                     .addProperty("ADBE Text Animator");
            anim.name = "Color";
            anim.property("ADBE Text Animator Properties")
                .addProperty("ADBE Text Fill Color")
                .expression = expColor("Color texto");
        }

        comp.openInViewer();

        alert(
            "Editable construido sobre \"" + comp.name + "\".\n\n" +
            "Capa base detectada: " + video.name + " (bloqueada, sin cambios)\n" +
            (borradas > 0 ? "Version anterior reemplazada: " + borradas + " capas\n" : "") +
            "\nTodo se controla desde \"" + NOMBRE_CTRL + "\" o desde la\n" +
            "ventana Graficos esenciales (Ventana > Graficos esenciales).");

    } catch (err) {
        alert("Error en la linea " + err.line + ":\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }

})();
