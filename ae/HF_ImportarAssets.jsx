/**
 * HF_ImportarAssets.jsx
 * ---------------------------------------------------------------------------
 * Puente Higgsfield -> After Effects.
 *
 * Lee un manifiesto JSON con assets ya descargados y los coloca dentro del
 * editable creado por CampanaIntegral_Editable.jsx, en la ranura ("slot") que
 * indique cada entrada.
 *
 * Ranuras admitidas:
 *   LOGO   -> reemplaza la fuente del marcador "HF | LOGO"
 *   FONDO  -> capa de fondo, justo encima del video base
 *   BROLL  -> capa de recurso encima del video base, con tiempo de entrada
 *   AUDIO  -> pista de audio
 *
 * Uso: Archivo > Scripts > Ejecutar archivo de script...
 *      Selecciona higgsfield/manifest.json cuando lo pida.
 */

(function HFImportarAssets() {

    var P = "HF | ";

    // -----------------------------------------------------------------
    // Lectura del manifiesto
    // -----------------------------------------------------------------

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
            throw new Error("El manifiesto no es JSON valido (contenido inesperado).");
        }
        return eval("(" + txt + ")");
    }

    function buscarComp(nombre) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === nombre) { return it; }
        }
        var activa = app.project.activeItem;
        return (activa instanceof CompItem) ? activa : null;
    }

    function buscarCapa(comp, nombre) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === nombre) { return comp.layer(i); }
        }
        return null;
    }

    function capaVideoBase(comp) {
        for (var i = comp.numLayers; i >= 1; i--) {
            var L = comp.layer(i);
            if (L.name.indexOf(P) !== 0 && (L instanceof AVLayer)) { return L; }
        }
        return comp.layer(comp.numLayers);
    }

    function importar(ruta) {
        var f = new File(ruta);
        if (!f.exists) { return null; }
        var io = new ImportOptions(f);
        try { io.importAs = ImportAsType.FOOTAGE; } catch (e) {}
        return app.project.importFile(io);
    }

    function ajustarAComp(capa, comp) {
        var src = capa.source;
        if (!src || !src.width || !src.height) { return; }
        var k = Math.max(comp.width / src.width, comp.height / src.height) * 100;
        capa.property("ADBE Transform Group").property("ADBE Scale").setValue([k, k]);
    }

    // -----------------------------------------------------------------
    // Ejecucion
    // -----------------------------------------------------------------

    var archivo = File.openDialog("Selecciona el manifiesto de Higgsfield (JSON)",
                                  "*.json");
    if (!archivo) { return; }

    var texto = leerArchivo(archivo);
    if (!texto) { alert("No pude leer el manifiesto."); return; }

    var manifiesto;
    try {
        manifiesto = parsearJSON(texto);
    } catch (ePar) {
        alert("Manifiesto invalido:\n" + ePar.toString());
        return;
    }

    var comp = buscarComp(manifiesto.comp || "");
    if (!comp) { alert("No encontre la composicion del manifiesto."); return; }

    var assets = manifiesto.assets || [];
    if (!assets.length) { alert("El manifiesto no tiene assets."); return; }

    app.beginUndoGroup("Importar assets de Higgsfield");

    var colocados = 0;
    var fallos = [];
    var nBroll = 0;
    var nAudio = 0;

    try {
        var base = capaVideoBase(comp);
        var carpetaManifiesto = archivo.parent;

        for (var i = 0; i < assets.length; i++) {
            var a = assets[i];
            var ranura = String(a.slot || "BROLL").toUpperCase();

            var ruta = String(a.file || "");
            if (ruta && ruta.charAt(0) !== "/" && !/^[A-Za-z]:/.test(ruta)) {
                ruta = carpetaManifiesto.fsName + "/" + ruta;
            }

            var item = importar(ruta);
            if (!item) {
                fallos.push(ranura + ": no encontre " + ruta);
                continue;
            }

            if (ranura === "LOGO") {
                var marcador = buscarCapa(comp, P + "LOGO");
                if (marcador) {
                    marcador.replaceSource(item, false);
                    ajustarAComp(marcador, comp);
                    var esc = marcador.property("ADBE Transform Group").property("ADBE Scale");
                    esc.setValue([esc.value[0] * 0.25, esc.value[1] * 0.25]);
                } else {
                    fallos.push("LOGO: no existe la capa " + P + "LOGO");
                    continue;
                }

            } else if (ranura === "FONDO") {
                var fondo = comp.layers.add(item);
                fondo.name = P + "FONDO";
                ajustarAComp(fondo, comp);
                fondo.moveBefore(base);

            } else if (ranura === "AUDIO") {
                nAudio++;
                var au = comp.layers.add(item);
                au.name = P + "AUDIO " + nAudio;
                au.startTime = Number(a.start || 0);
                au.moveToEnd();

            } else {
                nBroll++;
                var br = comp.layers.add(item);
                br.name = P + "BROLL " + nBroll;
                ajustarAComp(br, comp);
                br.startTime = Number(a.start || 0);
                if (a.duration) {
                    br.outPoint = br.startTime + Number(a.duration);
                }
                br.moveBefore(base);
            }

            colocados++;
        }

        var msg = "Assets colocados: " + colocados + " de " + assets.length + ".";
        if (fallos.length) { msg += "\n\nSin colocar:\n- " + fallos.join("\n- "); }
        alert(msg);

    } catch (err) {
        alert("Error en la linea " + err.line + ":\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }

})();
