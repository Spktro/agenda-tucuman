// Página especial (Noche de los Museos): solapas, filtro por tipo, línea de "ahora", mapa y "mi noche".
// Usa ESPECIAL (los lugares y sus actividades, en minutos desde el comienzo) y Guardados / Ubicacion de publico.js.
(() => {
    const D = ESPECIAL;
    const actividades = D.lugares.flatMap(l => l.actividades.map(a => ({ ...a, lugar: l })));
    const porEvento = {};
    for (const a of actividades) (porEvento[a.id] ??= []).push(a);

    const hora = m => { const t = D.desde + m; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
    const escapar = t => { const d = document.createElement("div"); d.textContent = t ?? ""; return d.innerHTML; };

    // Minutos desde el comienzo según el reloj del dispositivo (hora de Tucumán = UTC-3, sin horario de verano).
    function minutoAhora() {
        const [a, m, d] = D.fecha.split("-").map(Number);
        const comienzo = Date.UTC(a, m - 1, d, 3) + D.desde * 60000;
        return Math.floor((Date.now() - comienzo) / 60000);
    }

    // ---------------------------------------------------------------- solapas
    const solapas = document.querySelectorAll("#solapas-especial [data-solapa]");
    let mapa = null;
    function mostrar(vista) {
        solapas.forEach(s => s.classList.toggle("activa", s.dataset.solapa === vista));
        document.querySelectorAll("[data-vista]").forEach(v => v.classList.toggle("d-none", v.dataset.vista !== vista));
        document.getElementById("tipos").classList.toggle("d-none", vista === "mi-noche");
        if (vista === "mapa") { mapa ??= armarMapa(); setTimeout(() => mapa.invalidateSize(), 50); }
        if (vista === "mi-noche") pintarMiNoche();
    }
    solapas.forEach(s => s.addEventListener("click", ev => {
        ev.preventDefault();
        history.replaceState(null, "", `${location.pathname}${location.search}#${s.dataset.solapa}`);
        mostrar(s.dataset.solapa);
    }));

    // ---------------------------------------------------------------- filtro por tipo
    let tipo = "";
    document.querySelectorAll("#tipos [data-tipo]").forEach(b => b.addEventListener("click", () => {
        tipo = b.dataset.tipo;
        document.querySelectorAll("#tipos [data-tipo]").forEach(x => x.classList.toggle("activo", x === b));
        document.querySelectorAll(".bloque, .franja").forEach(el => el.classList.toggle("apagado", tipo !== "" && el.dataset.tipo !== tipo));
        document.querySelectorAll(".fila").forEach(f => f.classList.toggle("d-none", tipo !== "" && !f.dataset.tipos.split(" ").includes(tipo)));
        document.querySelectorAll(".grilla-seccion").forEach(s => {
            let n = s.nextElementSibling, alguna = false;
            while (n && n.classList.contains("fila")) { alguna ||= !n.classList.contains("d-none"); n = n.nextElementSibling; }
            s.classList.toggle("d-none", !alguna);
        });
        if (mapa) pintarMarcadores();
    }));

    // Las tarjetas de la grilla se abren también con el teclado.
    document.addEventListener("keydown", ev => {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("[data-ficha][role=button]")) { ev.preventDefault(); ev.target.click(); }
    });

    // ---------------------------------------------------------------- ahora
    function pintarAhora() {
        const m = minutoAhora();
        const linea = document.getElementById("linea-ahora");
        const [g0, g1] = D.grilla;
        if (linea) {
            const dentro = m >= g0 && m <= g1;
            linea.classList.toggle("d-none", !dentro);
            if (dentro) linea.style.setProperty("--pos", `${(100 * (m - g0) / (g1 - g0)).toFixed(2)}%`);
        }
        document.querySelectorAll(".bloque").forEach(b => b.classList.toggle("terminado", m > Number(b.dataset.fin) && m < D.duracion + 600));

        // De dos horas antes al cierre: lo que está pasando y lo que empieza en la próxima hora.
        const caja = document.getElementById("ahora-ya");
        if (m < -120 || m > D.duracion) { caja.classList.add("d-none"); return; }
        const ya = actividades.filter(a => !a.fondo && a.fin > m && a.inicio <= m + 60)
            .sort((a, b) => a.inicio - b.inicio).slice(0, 12);
        if (ya.length === 0) { caja.classList.add("d-none"); return; }
        caja.classList.remove("d-none");
        caja.querySelector(".ahora-lista").innerHTML = ya.map(a => `
            <div class="ahora-item" data-ficha="${a.id}" role="button" tabindex="0">
                <span class="ahora-hora">${a.inicio <= m ? "Ahora" : a.hora}</span>
                <span><strong>${escapar(a.titulo)}</strong><br><small>${escapar(a.lugar.nombre)}</small></span>
            </div>`).join("");
    }
    pintarAhora();
    setInterval(pintarAhora, 60000);

    // La grilla abre en la hora actual (en la noche) o en el comienzo, no en lo que pasó a la tarde.
    const grilla = document.getElementById("grilla");
    if (grilla) {
        const [g0, g1] = D.grilla;
        const objetivo = Math.min(Math.max(minutoAhora() - 30, 0), g1);
        const pista = grilla.querySelector(".fila-pista");
        if (pista && objetivo > g0) grilla.scrollLeft = pista.offsetWidth * (objetivo - g0) / (g1 - g0);
    }

    // ---------------------------------------------------------------- mapa
    let capa = null;
    function armarMapa() {
        const centro = D.partida ? [D.partida.lat, D.partida.lon] : [-26.8303, -65.2038];
        const m = crearMapa("mapa-especial", centro, 14);
        // Se arma con la solapa recién mostrada: cuando el contenedor toma su tamaño, Leaflet tiene que volver a medir.
        new ResizeObserver(() => m.invalidateSize()).observe(document.getElementById("mapa-especial"));
        if (D.partida) {
            L.marker(centro, { icon: L.divIcon({ className: "", html: '<div class="pin-partida">★</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
                .addTo(m).bindPopup(`<strong>${escapar(D.partida.nombre)}</strong><br><small>${escapar(D.partida.detalle)}</small>`);
        }
        m.on("popupopen", ev => ev.popup.getElement().querySelectorAll("[data-abrir]").forEach(a => a.addEventListener("click", e => {
            e.preventDefault();
            const falsa = document.createElement("div");
            falsa.dataset.ficha = a.dataset.abrir;
            document.body.appendChild(falsa);
            falsa.click();
            falsa.remove();
        })));
        Ubicacion.alCambiar(yo => L.circleMarker(yo, { radius: 8, color: "#4da3ff", fillColor: "#4da3ff", fillOpacity: .9 }).addTo(m).bindPopup("Estás acá"));
        mapa = m;
        pintarMarcadores();
        return m;
    }

    function pintarMarcadores() {
        capa?.remove();
        capa = L.layerGroup().addTo(mapa);
        const mios = new Set(Guardados.todos());
        const limites = [], sinUbicar = [];
        for (const l of D.lugares) {
            const lista = l.actividades.filter(a => tipo === "" || a.categoria === tipo);
            if (lista.length === 0) continue;
            if (l.lat == null) { sinUbicar.push(l.nombre); continue; }
            const tieneMio = lista.some(a => mios.has(a.id));
            const color = tieneMio ? "#ffc94d" : l.traslado ? "#4dd0a6" : "#ff5a4f";
            const unicas = [...new Map(lista.map(a => [a.id, a])).values()];
            const html = `<strong>${escapar(l.nombre)}</strong>${l.direccion ? `<br><small>${escapar(l.direccion)}</small>` : ""}` +
                (l.traslado ? `<div class="small mt-1">🚌 ${escapar(l.traslado)}</div>` : "") +
                unicas.map(a => `<div class="mt-1"><a href="#" data-abrir="${a.id}">${escapar(a.titulo)}</a><br><small>${a.fondo ? `${a.hora === "Toda la noche" ? "Toda la noche" : `${a.hora} a ${a.horaFin ?? ""}`}` : porEvento[a.id].filter(x => x.lugar === l).map(x => x.hora).join(" · ")}</small></div>`).join("");
            L.circleMarker([l.lat, l.lon], { radius: Math.min(14, 6 + unicas.length), color, fillColor: color, fillOpacity: .8, weight: 2 })
                .addTo(capa).bindPopup(html, { maxHeight: 320 });
            limites.push([l.lat, l.lon]);
        }
        const cercanos = limites.filter(p => distanciaKm(D.partida ? [D.partida.lat, D.partida.lon] : p, p) < 6);
        if (cercanos.length > 1) mapa.fitBounds(cercanos, { padding: [30, 30], maxZoom: 16 });
        document.getElementById("sin-ubicar").textContent =
            `Rojo: lugares · verde: con colectivo gratis desde la plaza · amarillo: tenés algo guardado.` +
            (sinUbicar.length ? ` Sin ubicar en el mapa: ${sinUbicar.join(", ")}.` : "");
    }

    // ---------------------------------------------------------------- mi noche
    // Con lo guardado con la ★ arma un recorrido posible: para cada actividad elige el primer horario al que se llega
    // después de la anterior (caminando entre lugares) y avisa lo que se superpone.
    const minutosCaminando = (a, b) => a.lat == null || b.lat == null ? null
        : Math.round(distanciaKm([a.lat, a.lon], [b.lat, b.lon]) * 1.3 / 4.5 * 60);

    // Cuando no se dijo hasta qué hora es, la duración es supuesta: se tolera un poco de superposición.
    const tolerancia = a => a.horaFin ? 0 : 15;
    const viaje = (a, b) => a.lugar === b.lugar ? 0 : (minutosCaminando(a.lugar, b.lugar) ?? 15);
    const llegaDe = (a, b) => a.fin - tolerancia(a) + viaje(a, b) <= b.inicio;

    function recorrido(ids) {
        const elegidas = ids.filter(id => porEvento[id]);
        const flexibles = elegidas.filter(id => porEvento[id][0].fondo).map(id => porEvento[id][0]);
        // Primero lo que tiene un solo horario; lo que se repite se acomoda en el primer horario que no choca.
        const fijas = elegidas.filter(id => !porEvento[id][0].fondo)
            .map(id => porEvento[id].slice().sort((a, b) => a.inicio - b.inicio))
            .sort((a, b) => a.length - b.length || a[0].inicio - b[0].inicio);
        const ubicadas = [];
        for (const opciones of fijas) {
            const entra = opciones.find(a => ubicadas.every(u => llegaDe(a, u.actividad) || llegaDe(u.actividad, a)));
            ubicadas.push({ actividad: entra ?? opciones[0], otros: opciones.length - 1 });
        }
        ubicadas.sort((a, b) => a.actividad.inicio - b.actividad.inicio);
        const pasos = ubicadas.map((p, i) => ({
            ...p, choca: i > 0 && !llegaDe(ubicadas[i - 1].actividad, p.actividad) ? ubicadas[i - 1].actividad : null
        }));
        return { pasos, flexibles };
    }

    function pintarMiNoche() {
        const ids = Guardados.todos();
        document.getElementById("cantidad-mia").textContent = ids.filter(id => porEvento[id]).length;
        const caja = document.getElementById("mi-noche");
        if (!caja) return;
        const { pasos, flexibles } = recorrido(ids);
        if (pasos.length === 0 && flexibles.length === 0) {
            caja.innerHTML = `<div class="py-4 text-center texto-apagado">
                Todavía no elegiste nada. En la grilla o el mapa, tocá una actividad y guardala con la ★:
                acá se arma tu recorrido, en orden y con lo que tardás en ir de un lugar a otro.</div>`;
            return;
        }
        let html = "", previo = null;
        for (const { actividad: a, choca, otros } of pasos) {
            if (previo && previo.lugar !== a.lugar) {
                const min = minutosCaminando(previo.lugar, a.lugar);
                const km = min == null ? null : distanciaKm([previo.lugar.lat, previo.lugar.lon], [a.lugar.lat, a.lugar.lon]);
                const texto = min == null ? "Cambio de lugar (sin ubicación en el mapa)"
                    : min <= 25 ? `🚶 ${min} min a pie`
                    : a.lugar.traslado ? `🚌 ${escapar(a.lugar.traslado)} desde la plaza (a pie serían ${min} min)`
                    : km > 8 ? `🚗 ${textoDistancia(km).replace("a ", "")}: hay que ir en auto`
                    : `🚕 ${min} min a pie: mejor en auto o taxi`;
                html += `<div class="tramo">${texto}</div>`;
            }
            html += `<div class="paso${choca ? " choca" : ""}" data-ficha="${a.id}" role="button" tabindex="0">
                <div class="paso-hora">${a.hora}${a.horaFin ? `<small>a ${a.horaFin}</small>` : ""}</div>
                <div class="flex-fill"><div class="fw-bold">${escapar(a.titulo)}</div><div class="small texto-apagado">${escapar(a.lugar.nombre)}</div>
                ${choca ? `<div class="small aviso-choca">Se superpone con «${escapar(choca.titulo)}»: no llegás a las dos.</div>` : ""}
                ${otros > 0 ? `<div class="small texto-apagado">Tiene ${otros} horario${otros > 1 ? "s" : ""} más: si no llegás, hay otra.</div>` : ""}</div>
                <button class="boton-guardar activo" type="button" data-guardar="${a.id}" aria-label="Quitar"></button>
            </div>`;
            previo = a;
        }
        if (flexibles.length) {
            html += `<div class="dia-encabezado"><span class="nombre">Cuando puedas</span></div><p class="small texto-apagado">Están abiertas buena parte de la noche: pasá entre una cosa y otra.</p>`;
            html += flexibles.map(a => `<div class="paso" data-ficha="${a.id}" role="button" tabindex="0">
                <div class="paso-hora">${a.hora === "Toda la noche" ? "Toda<small>la noche</small>" : `${a.hora}<small>a ${a.horaFin ?? ""}</small>`}</div>
                <div class="flex-fill"><div class="fw-bold">${escapar(a.titulo)}</div><div class="small texto-apagado">${escapar(a.lugar.nombre)}</div></div>
                <button class="boton-guardar activo" type="button" data-guardar="${a.id}" aria-label="Quitar"></button></div>`).join("");
        }
        html += `<div class="d-flex gap-2 mt-3"><button class="btn btn-contorno btn-sm" type="button" id="compartir-recorrido">Compartir mi recorrido</button></div>`;
        caja.innerHTML = html;
        document.getElementById("compartir-recorrido").addEventListener("click", () => {
            const mias = ids.filter(id => porEvento[id]);
            const url = `${location.origin}${location.pathname}?recorrido=${encodeURIComponent(mias.join(","))}#mi-noche`;
            compartir(document.title, `Mi recorrido para ${document.querySelector("h1").textContent}`, url);
        });
    }

    // Al tocar una ★ (en la ficha o acá) se rehace el recorrido. En captura, como el de publico.js, que corta la propagación.
    document.addEventListener("click", ev => {
        if (!ev.target.closest("[data-guardar]")) return;
        setTimeout(() => {
            if (!document.getElementById("vista-mi-noche").classList.contains("d-none")) pintarMiNoche();
            else document.getElementById("cantidad-mia").textContent = Guardados.todos().filter(id => porEvento[id]).length;
            if (mapa) pintarMarcadores();
            marcarGuardados();
        }, 50);
    }, true);

    // En la grilla, lo guardado se marca.
    function marcarGuardados() {
        const mios = new Set(Guardados.todos());
        document.querySelectorAll(".bloque, .franja").forEach(b => b.classList.toggle("mio", mios.has(b.dataset.ficha)));
    }
    marcarGuardados();

    // ---------------------------------------------------------------- recorrido compartido
    const compartido = (new URLSearchParams(location.search).get("recorrido") ?? "").split(",").filter(id => porEvento[id]);
    const faltan = compartido.filter(id => !Guardados.tiene(id));
    if (faltan.length) {
        const aviso = document.getElementById("compartido");
        aviso.classList.remove("d-none");
        aviso.querySelector("strong").textContent = compartido.length;
        document.getElementById("sumar-compartido").addEventListener("click", () => {
            faltan.forEach(id => Guardados.alternar(id));
            aviso.classList.add("d-none");
            pintarGuardados(document);
            marcarGuardados();
            mostrar("mi-noche");
        });
    }

    document.getElementById("cantidad-mia").textContent = Guardados.todos().filter(id => porEvento[id]).length;
    const inicial = location.hash.slice(1);
    mostrar(["grilla", "mapa", "mi-noche"].includes(inicial) ? inicial : "grilla");
})();
