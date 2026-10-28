// Código común de la parte pública: ficha del evento, ubicación y distancias, eventos guardados.

// ---------------------------------------------------------------- ubicación
// Si la persona aceptó compartir su ubicación una vez, se recuerda y cada evento muestra a cuánto está.
// La distancia se calcula acá, en el navegador (en línea recta): no se manda la ubicación a ningún lado.
const Ubicacion = (() => {
    const CLAVE = "agenda.ubicacion";
    let actual = null;
    const avisos = [];

    function guardada() {
        try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch { return null; }
    }

    function pedir(mostrarError) {
        return new Promise(resolver => {
            if (!navigator.geolocation) { mostrarError?.("Este navegador no permite saber la ubicación."); return resolver(null); }
            navigator.geolocation.getCurrentPosition(pos => {
                actual = [pos.coords.latitude, pos.coords.longitude];
                try { localStorage.setItem(CLAVE, JSON.stringify({ usar: true })); } catch { }
                avisos.forEach(f => f(actual));
                anotarDistancias(document);
                resolver(actual);
            }, () => { mostrarError?.("No se pudo obtener tu ubicación (revisá el permiso del navegador)."); resolver(null); },
               { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
        });
    }

    // Al entrar: si ya la había aceptado, se pide sola (el navegador no vuelve a preguntar).
    if (guardada()?.usar) pedir();

    return {
        pedir,
        get actual() { return actual; },
        alCambiar(f) { avisos.push(f); if (actual) f(actual); }
    };
})();

function distanciaKm([la1, lo1], [la2, lo2]) {
    const rad = x => x * Math.PI / 180;
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function textoDistancia(km) {
    return km < 1 ? `a ${Math.round(km * 1000 / 10) * 10} m` : `a ${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

// Pone "a 1,2 km" en todo lo que tenga data-lat / data-lon dentro de la raíz.
function anotarDistancias(raiz) {
    if (!Ubicacion.actual) return;
    const elementos = [...raiz.querySelectorAll("[data-lat]")];
    if (raiz.matches?.("[data-lat]")) elementos.push(raiz);
    elementos.forEach(el => {
        if (!el.dataset.lat) return;
        const km = distanciaKm(Ubicacion.actual, [Number(el.dataset.lat), Number(el.dataset.lon)]);
        el.dataset.km = km.toFixed(3);
        const etiqueta = el.querySelector(".distancia-valor");
        if (etiqueta) { etiqueta.textContent = textoDistancia(km); etiqueta.classList.remove("d-none"); }
    });
}

// ---------------------------------------------------------------- guardados
// Los eventos guardados viven en este dispositivo (sin cuenta).
const Guardados = (() => {
    const CLAVE = "agenda.guardados";
    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch { return []; } };
    const escribir = ids => { try { localStorage.setItem(CLAVE, JSON.stringify(ids)); } catch { } };
    return {
        todos: leer,
        tiene: id => leer().includes(id),
        alternar(id) {
            const ids = leer();
            const i = ids.indexOf(id);
            if (i >= 0) ids.splice(i, 1); else ids.push(id);
            escribir(ids);
            return i < 0;
        }
    };
})();

function pintarGuardados(raiz) {
    raiz.querySelectorAll("[data-guardar]").forEach(b => {
        const si = Guardados.tiene(b.dataset.guardar);
        b.classList.toggle("activo", si);
        b.setAttribute("aria-pressed", si);
        b.title = si ? "Quitar de guardados" : "Guardar";
        if (b.dataset.texto !== undefined) b.querySelector("span").textContent = si ? "Guardado" : "Guardar";
    });
}

document.addEventListener("click", ev => {
    const boton = ev.target.closest("[data-guardar]");
    if (!boton) return;
    ev.preventDefault();
    ev.stopPropagation();
    Guardados.alternar(boton.dataset.guardar);
    pintarGuardados(document);
}, true);

// ---------------------------------------------------------------- ficha
// Al tocar una tarjeta se abre la ficha del evento (se trae de /evento/{id}?parcial=true).
(() => {
    const modal = document.getElementById("ficha");
    if (!modal) return;
    const cuerpo = document.getElementById("ficha-cuerpo");
    const ventana = new bootstrap.Modal(modal);

    document.addEventListener("click", async ev => {
        // Los botones y enlaces dentro de la tarjeta hacen lo suyo sin abrir la ficha.
        if (ev.target.closest("a, button, .dropdown-menu")) return;
        const tarjeta = ev.target.closest("[data-ficha]");
        if (!tarjeta) return;
        cuerpo.innerHTML = '<div class="py-5 text-center texto-apagado">Cargando…</div>';
        ventana.show();
        try {
            // La copia estática (GitHub Pages) define urlFicha: ahí cada ficha es un archivo.
            const r = await fetch(window.urlFicha?.(tarjeta.dataset.ficha) ?? `/evento/${encodeURIComponent(tarjeta.dataset.ficha)}?parcial=true`);
            cuerpo.innerHTML = r.ok ? await r.text() : '<div class="py-5 text-center">No se encontró el evento.</div>';
            prepararFicha(cuerpo);
        } catch {
            cuerpo.innerHTML = '<div class="py-5 text-center">No se pudo cargar.</div>';
        }
    });
})();

function prepararFicha(raiz) {
    const principal = raiz.querySelector(".imagen-principal");
    raiz.querySelectorAll(".miniaturas img").forEach(m => m.addEventListener("click", () => {
        principal.src = m.src;
        raiz.querySelectorAll(".miniaturas img").forEach(x => x.classList.toggle("activa", x === m));
    }));
    pintarGuardados(raiz);
    anotarDistancias(raiz);
}

// ---------------------------------------------------------------- al cargar
document.querySelectorAll(".ficha").forEach(prepararFicha);
pintarGuardados(document);
Ubicacion.alCambiar(() => anotarDistancias(document));

// Mapa con mosaicos de OpenStreetMap (no piden clave). El tono oscuro se logra con un filtro de CSS.
function crearMapa(id, centro, zoom) {
    const mapa = L.map(id, { zoomControl: false }).setView(centro, zoom);
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© colaboradores de OpenStreetMap"
    }).addTo(mapa);
    return mapa;
}

// En las filas de botones que se deslizan, el elegido queda a la vista.
document.querySelectorAll(".chips").forEach(fila => {
    const activo = fila.querySelector(".activo");
    if (activo && activo.offsetLeft + activo.offsetWidth > fila.clientWidth)
        fila.scrollLeft = activo.offsetLeft - fila.offsetLeft - 16;
});

// ---------------------------------------------------------------- compartir
// En el celular abre el menú de compartir del sistema (WhatsApp, Instagram...); en la compu copia el mensaje con el link.
async function compartir(titulo, texto, url) {
    if (navigator.share) {
        try { await navigator.share({ title: titulo, text: texto, url }); } catch { }
        return;
    }
    try {
        await navigator.clipboard.writeText(`${texto}\n${url}`);
        aviso("Copiado: pegalo donde quieras compartirlo");
    } catch {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`, "_blank", "noopener");
    }
}

function aviso(texto) {
    const el = document.createElement("div");
    el.className = "aviso";
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-compartir]");
    if (b) compartir(b.dataset.titulo, b.dataset.texto, b.dataset.url);
});
