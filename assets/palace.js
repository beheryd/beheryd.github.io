/* ------------------------------------------------------------------
   The memory palace — a tunnel book of paper frames.

   Depth is time: the facade sits at z = 0, the newest thought one step
   behind it, the oldest at the far end, and the back wall behind that.
   Thoughts come from thoughts.json (built by Jekyll from _thoughts/*.md).
   ------------------------------------------------------------------ */
(() => {
    'use strict';

    const PALETTE = ['#f4e48a', '#e9a48f', '#a8dcb4', '#f1b97a', '#e8a0a0'];
    const FACADE_COLOR = '#f6e9a0';
    const BACKWALL_COLOR = '#fbf3cf';
    // inks for the back-wall visualizer: the paper colors plus the teal ground
    const INKS = ['#e9a48f', '#a8dcb4', '#f1b97a', '#e8a0a0', '#f4e48a', '#8ccabb'];

    const FOCAL = 900;                 // perspective focal length (world units)
    const STEP = FOCAL * 0.2;          // depth between frames — keeps the tunnel closed
    const FADE = STEP * 0.75;          // frames fade out over this distance as you pass them
    const FAR = FOCAL * 10;            // beyond this, frames are too small to bother drawing

    const $ = (id) => document.getElementById(id);
    const hall = $('hall');
    const palace = $('palace');
    const ledgerCells = $('ledger-cells');
    const reader = $('reader');
    const readerMeta = $('reader-meta');
    const readerTitle = $('reader-title');
    const readerBody = $('reader-body');
    const readerReply = $('reader-reply');
    const readerReplyLink = $('reader-reply-link');
    const EMAIL = 'davidbehery@g.harvard.edu';
    const readerCard = reader.querySelector('.card');

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    let thoughts = [];   // newest first
    let layers = [];
    let geo = null;
    let camZ = 0;
    let targetZ = 0;
    let maxZ = 0;
    let pointer = { x: 0, y: 0 };
    let hasMouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let hereIndex = -1;
    let openTimer = 0;
    let snapTimer = 0;

    /* ---------------- geometry ---------------- */

    function measure() {
        // a hidden or not-yet-laid-out window can report 0×0; fall back to a sane size
        // (the resize handler rebuilds with the real one)
        const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
        const vh = window.innerHeight || document.documentElement.clientHeight || 768;
        const narrow = vw < 640;
        const W = Math.min(vw * (narrow ? 0.86 : 0.78), 1100);
        const P = Math.min(W * 0.13, vh * 0.15);
        // breathing room above and below, scaled to the window (and roomier than the parallax drift)
        const topM = Math.max(narrow ? 22 : 34, vh * 0.055);
        const botM = Math.max(narrow ? 22 : 34, vh * 0.055);
        const H = Math.max(280, vh - P - topM - botM);
        const pw = Math.max(W * 0.12, 44);      // pillar width
        const lh = Math.max(H * 0.15, 58);      // lintel height
        const fh = Math.max(H * 0.1, 38);       // floor band height
        geo = {
            vw, vh, W, H, P, pw, lh, fh, narrow,
            cx: vw / 2,
            cy: topM + P + H / 2,
            titleSize: clamp(Math.min(lh * 0.19, (W - 2 * pw) * 0.027), 10, 18),
            smallSize: clamp(pw * 0.1, 9, 12),
            linkSize: clamp(pw * 0.1, 10, 13),
        };
        const vars = {
            '--W': W, '--H': H, '--P': P, '--pw': pw, '--lh': lh, '--fh': fh,
            '--title-size': geo.titleSize, '--small-size': geo.smallSize, '--link-size': geo.linkSize,
        };
        for (const [k, v] of Object.entries(vars)) hall.style.setProperty(k, v.toFixed(2));
        document.body.classList.toggle('narrow', narrow);
    }

    /* A paper cutout: lintel and floor bands joined by two Ionic columns. Each
       column has a tapering shaft, a capital that flares out over it (abacus,
       scroll band, spiral volutes) and a torus + plinth base. Ink lines engrave
       the details. */
    function spiral(cx, cy, r, dir) {
        // Archimedean spiral that peels off the volute's outer ring at the top and curls inward
        const turns = 2.25, steps = 72, pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * turns * Math.PI * 2;
            const rr = r * (1 - 0.86 * (i / steps));
            const a = -Math.PI / 2 - dir * t;
            pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
        }
        return `M${pts.join('L')}`;
    }

    function columnParts(cx) {
        const { H, pw, lh, fh } = geo;
        const floorTop = H - fh;
        const half = pw / 2;                     // capital spans the full pillar band
        const ab = pw * 0.08;                    // abacus slab
        const band = pw * 0.12;                  // scroll band under the abacus
        const rv = pw * 0.17;                    // volute radius
        const vy = lh + ab + rv * 0.9;
        const vx = half - rv;                    // volute centres, from cx
        const neck = lh + ab + band;             // shaft starts here
        const swTop = pw * 0.31, swBot = pw * 0.36;
        const plH = fh * 0.32, torH = pw * 0.09;
        const baseTop = floorTop - plH - torH;
        const plHalf = pw * 0.5, torHalf = pw * 0.43;

        const shaft = `M${cx - swTop} ${neck}L${cx + swTop} ${neck}L${cx + swBot} ${baseTop}L${cx - swBot} ${baseTop}Z`;
        const capital =
            `M${cx - half} ${lh}H${cx + half}V${lh + ab}H${cx - half}Z` +
            `M${cx - half + rv * 0.4} ${lh + ab}H${cx + half - rv * 0.4}V${neck}H${cx - half + rv * 0.4}Z`;
        const base =
            `M${cx - torHalf} ${baseTop}H${cx + torHalf}V${baseTop + torH}H${cx - torHalf}Z` +
            `M${cx - plHalf} ${baseTop + torH}H${cx + plHalf}V${floorTop}H${cx - plHalf}Z`;
        const volutes = [[cx - vx, vy, 1], [cx + vx, vy, -1]];

        const flutes = [];
        // fluting stops short of the capital and the base
        const fTop = neck + pw * 0.3, fBot = baseTop - pw * 0.24;
        const at = (y) => swTop + (swBot - swTop) * ((y - neck) / (baseTop - neck));
        for (const k of [-0.55, 0, 0.55]) {
            flutes.push(`M${cx + k * at(fTop)} ${fTop}L${cx + k * at(fBot)} ${fBot}`);
        }
        // the curved echinus between the volutes, just under the band
        const echinus = `M${cx - vx} ${neck}Q${cx} ${neck + rv * 0.9} ${cx + vx} ${neck}`;
        return { shaft, capital, base, volutes, rv, flutes, echinus };
    }

    function frameSVG({ label = false } = {}) {
        const { W, H, pw, lh, fh } = geo;
        const floorTop = H - fh;
        const bands = `M0 0H${W}V${lh}H0Z M0 ${floorTop}H${W}V${H}H0Z`;
        const cols = [columnParts(pw / 2), columnParts(W - pw / 2)];

        const solid = bands + cols.map((c) => c.shaft + c.capital + c.base).join('');
        const discs = (cls) => cols.flatMap((c) => c.volutes.map(([x, y]) =>
            `<circle class="${cls}" cx="${x}" cy="${y}" r="${c.rv}"/>`)).join('');
        const engraving = cols.map((c) =>
            c.volutes.map(([x, y, dir]) => spiral(x, y, c.rv, dir)).join(' ')).join(' ');

        return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
            <g class="shadow" transform="translate(6 10)">
                <path d="${solid}"/>${discs('')}
            </g>
            <path class="paper" d="${solid}"/>
            ${label ? `<rect class="label" x="0" y="${lh * 0.3}" width="${W}" height="${lh * 0.7}"/>` : ''}
            <path class="lines" d="${solid}"/>
            <path class="lines faint" d="M0 ${lh * 0.16}H${W} M0 ${lh * 0.3}H${W} M0 ${floorTop + fh * 0.5}H${W}"/>
            <path class="lines faint flutes" d="${cols.map((c) => c.flutes.join(' ')).join(' ')}"/>
            <path class="lines" d="${cols.map((c) => c.echinus).join(' ')}"/>
            ${discs('paper')}
            ${discs('lines')}
            <path class="lines" d="${engraving}"/>
        </svg>`;
    }

    /* The roof, after a classical pediment: a raking cornice (the thick sloped
       band) around a recessed tympanum, a horizontal cornice along the base, and
       short vertical ends. Below it, a row of dentils slides slowly (CSS). */
    const PED_OVER = 0.015;                  // how far the roof overhangs each side, × facade width
    const PED_END = 0.2;                     // height of the vertical ends, × roof height
    const PED_BASE = 0.16;                   // horizontal cornice band, × roof height
    const PED_RAKE = 0.2;                    // thickness of the sloped band at the peak, × roof height

    function fillPediment(ped) {
        const w = geo.W * (1 + 2 * PED_OVER), h = geo.P;
        const e = h * PED_END, hb = h * PED_BASE, t = h * PED_RAKE;
        const slope = (h - e) / (w / 2);                        // rise per unit run of the roof edge
        const roof = `M0 ${h}L0 ${h - e}L${w / 2} 0L${w} ${h - e}L${w} ${h}Z`;
        const baseY = h - hb;
        const tw = (baseY - t) / slope;                         // half-width of the tympanum
        const tymp = `M${w / 2 - tw} ${baseY}L${w / 2} ${t}L${w / 2 + tw} ${baseY}Z`;
        const by = t * 0.45, bw = (baseY - by) / slope;         // bevel line inside the raking band
        const bevel = `M${w / 2 - bw} ${baseY}L${w / 2} ${by}L${w / 2 + bw} ${baseY}`;
        const fillet = `M0 ${baseY}H${w} M0 ${h - hb * 0.42}H${w}`;
        ped.innerHTML = `
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
                <path class="paper" d="${roof}"/>
                <path class="tympanum" d="${tymp}"/>
                <path class="lines" d="${roof} ${tymp}"/>
                <path class="lines faint" d="${bevel} ${fillet}"/>
            </svg>`;
    }

    /* The back wall: risograph-style ink circles drifting and overprinting
       (multiply), over faint outlines that keep flowing deeper into the hall. */
    const viz = { canvas: null, ctx: null, w: 0, h: 0, blobs: [] };

    function sizeVisualizer() {
        if (!viz.canvas) return;
        const q = Math.min(window.devicePixelRatio || 1, 2) * 0.85;
        viz.w = viz.canvas.width = Math.round(geo.W * q);
        viz.h = viz.canvas.height = Math.round(geo.H * q);
    }

    function seedVisualizer() {
        const rnd = (a, b) => a + Math.random() * (b - a);
        viz.blobs = INKS.map((color) => ({
            color,
            r: rnd(0.18, 0.3),                         // radius, × wall height
            ax: rnd(0.2, 0.36), ay: rnd(0.14, 0.3),   // orbit size, × wall size
            wx: rnd(0.12, 0.3) * (Math.random() < 0.5 ? -1 : 1),
            wy: rnd(0.1, 0.26),
            px: rnd(0, Math.PI * 2), py: rnd(0, Math.PI * 2),
            depth: rnd(0.4, 1.3),                      // how much it leans toward the cursor
        }));
    }

    function drawVisualizer(now, mx, my) {
        const { ctx, w, h } = viz;
        if (!ctx) return;
        const t = reduceMotion.matches ? 9 : now / 1000;
        const m = Math.min(w, h);

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = BACKWALL_COLOR;
        ctx.fillRect(0, 0, w, h);

        // outlines receding toward the centre, endlessly
        ctx.lineWidth = Math.max(1, m * 0.004);
        const RINGS = 8;
        for (let k = 0; k < RINGS; k++) {
            const p = (k / RINGS + t * 0.03) % 1;
            const e = (1 - p) * (1 - p);
            const a = 0.5 * Math.sin(Math.PI * p);
            ctx.strokeStyle = `rgba(44, 39, 51, ${(a * 0.35).toFixed(3)})`;
            ctx.strokeRect((w - w * e) / 2, (h - h * e) / 2, w * e, h * e);
        }

        // overprinting inks
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.62;                        // light overprint, so overlaps stay pastel
        for (const b of viz.blobs) {
            const x = w / 2 + Math.sin(t * b.wx + b.px) * b.ax * w + mx * b.depth * w * 0.07;
            const y = h / 2 + Math.cos(t * b.wy + b.py) * b.ay * h + my * b.depth * h * 0.07;
            const r = m * b.r * (1 + 0.08 * Math.sin(t * 0.45 + b.px));
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /* ---------------- building the hall ---------------- */

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function tint(color, amt) {
        const rgb = color.startsWith('#')
            ? [0, 8, 16].map((sh) => (parseInt(color.slice(1), 16) >> (16 - sh)) & 255)
            : color.match(/\d+/g).map(Number);
        const mix = (c) => Math.round(c + (255 - c) * amt);
        return `rgb(${rgb.map(mix).join(', ')})`;
    }

    function addLayer(kind, z, color) {
        const node = el('div', `layer ${kind}`);
        node.style.setProperty('--c', color);
        node.style.setProperty('--c-hi', tint(color, 0.35));
        node.style.zIndex = String(100000 - Math.round(z));
        hall.appendChild(node);
        const layer = {
            el: node, kind, z,
            mx: 0, my: 0,
            tilt: (Math.random() * 2 - 1),
            last: '', lastOpacity: -1, visible: true,
        };
        layers.push(layer);
        return layer;
    }

    function buildFacade() {
        const L = addLayer('facade', 0, FACADE_COLOR);
        const n = L.el;
        n.innerHTML = frameSVG();

        const ped = el('div', 'pediment');
        fillPediment(ped);
        n.appendChild(ped);

        // dentil course under the roof, sliding slowly left to right
        n.appendChild(el('div', 'dentils'));

        const links = el('nav', 'lintel-title entablature printed');
        links.setAttribute('aria-label', 'Links');
        links.appendChild($('links').content.cloneNode(true));
        n.appendChild(links);

        const plaque = el('div', 'plaque');
        const intro = el('p');
        const kempner = el('a', '', 'Kempner');
        kempner.href = 'https://kempnerinstitute.harvard.edu/';
        kempner.target = '_blank';
        kempner.rel = 'noopener';
        intro.append("I'm currently a ", kempner, ' post-bac scholar at Harvard.');
        plaque.append(el('h1', 'printed', "I'm David Behery"), intro);
        const more = el('button', '', 'Read more');
        more.type = 'button';
        more.addEventListener('click', () => navigate('#about'));
        plaque.appendChild(more);
        n.appendChild(plaque);
        return L;
    }

    function formatDate(iso) {
        const d = new Date(`${iso}T12:00:00`);
        if (Number.isNaN(d.getTime())) return iso || '';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function buildFrame(t, i) {
        const L = addLayer('frame', (i + 1) * STEP, t.color);
        L.thought = t;
        const n = L.el;
        n.innerHTML = frameSVG({ label: true });   // cream title band on the lintel

        const title = el('div', 'lintel-title thought-title printed');
        title.appendChild(el('span', 't', t.title));
        n.appendChild(title);

        n.appendChild(el('div', 'floor-date printed', formatDate(t.date)));

        n.addEventListener('click', (e) => {
            if (dragMoved) return;
            e.preventDefault();
            navigate(`#${t.slug}`);
        });
        return L;
    }

    function buildBackwall() {
        const L = addLayer('backwall', (thoughts.length + 1) * STEP, BACKWALL_COLOR);
        viz.canvas = el('canvas', 'backwall-canvas');
        viz.canvas.setAttribute('aria-hidden', 'true');
        viz.ctx = viz.canvas.getContext('2d');
        L.el.appendChild(viz.canvas);
        sizeVisualizer();
        seedVisualizer();
        return L;
    }

    function buildLedger() {
        ledgerCells.textContent = '';
        thoughts.forEach((t) => {
            const li = el('li');
            const a = el('a', 'printed');
            a.href = `#${t.slug}`;
            a.title = `No. ${t.no} — ${t.title}`;
            a.setAttribute('aria-label', `No. ${t.no}: ${t.title}, ${formatDate(t.date)}`);
            a.style.setProperty('--c', t.color);
            a.appendChild(el('span', '', String(t.no)));
            li.appendChild(a);
            ledgerCells.appendChild(li);
        });
    }

    function build() {
        hall.textContent = '';
        layers = [];
        buildFacade();
        thoughts.forEach(buildFrame);
        buildBackwall();
        buildLedger();
        maxZ = thoughts.length * STEP;
    }

    function rebuildGeometry() {
        measure();
        sizeVisualizer();
        for (const L of layers) {
            L.drawn = false;
            const svg = L.el.querySelector(':scope > svg');
            if (!svg) continue;
            const tmp = document.createElement('div');
            tmp.innerHTML = frameSVG({ label: L.kind === 'frame' });
            svg.replaceWith(tmp.firstElementChild);
            if (L.kind === 'facade') {
                fillPediment(L.el.querySelector('.pediment'));
            }
            L.last = '';
        }
    }

    /* ---------------- render loop ---------------- */

    function frame(now) {
        const still = reduceMotion.matches;

        camZ += (targetZ - camZ) * (still ? 1 : 0.085);
        if (Math.abs(targetZ - camZ) < 0.05) camZ = targetZ;

        let tx = pointer.x, ty = pointer.y;
        if (still) { tx = 0; ty = 0; }
        else if (!hasMouse) {                       // touch: a slow idle sway
            const t = now / 1000;
            tx = Math.sin(t * 0.33) * 0.55;
            ty = Math.sin(t * 0.21 + 1.3) * 0.35;
        }

        const { W, H, cx, cy, narrow } = geo;
        const par = narrow ? 16 : 40;

        for (const L of layers) {
            const d = L.z - camZ;
            const show = d > -FADE && d < FAR;
            if (show !== L.visible) {
                L.el.style.visibility = show ? '' : 'hidden';
                L.visible = show;
            }
            if (!show) continue;

            const s = FOCAL / (FOCAL + d);
            const k = still ? 1 : 0.045 + 0.075 * Math.min(1, s);   // near sheets respond faster
            L.mx += (tx - L.mx) * k;
            L.my += (ty - L.my) * k;

            const ox = L.mx * par * s;
            const oy = L.my * par * 0.55 * s;
            const rot = L.mx * 0.6 * s * L.tilt;
            const t = `translate3d(${(cx - W / 2 + ox).toFixed(2)}px, ${(cy - H / 2 + oy).toFixed(2)}px, 0) scale(${s.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
            if (t !== L.last) { L.el.style.transform = t; L.last = t; }

            const op = d < 0 ? clamp(1 + d / FADE, 0, 1) : 1;
            const opR = Math.round(op * 100) / 100;
            if (opR !== L.lastOpacity) {
                L.el.style.opacity = opR === 1 ? '' : String(opR);
                L.el.classList.toggle('ghost', opR < 0.6);
                L.lastOpacity = opR;
            }

            if (L.kind === 'backwall' && (!still || !L.drawn)) {
                drawVisualizer(now, L.mx, L.my);
                L.drawn = true;
            }
        }

        const here = Math.round(camZ / STEP);
        if (here !== hereIndex) { hereIndex = here; updateHere(); }

        requestAnimationFrame(frame);
    }

    function updateHere() {
        layers.filter((L) => L.kind === 'frame').forEach((L, i) => {
            L.el.classList.toggle('is-here', i + 1 === hereIndex);
        });
        ledgerCells.querySelectorAll('a').forEach((a, i) => {
            if (i + 1 === hereIndex) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
        });
    }


    /* ---------------- walking ---------------- */

    function walkTo(z) {
        targetZ = clamp(z, 0, maxZ);
    }

    function scheduleSnap(delay = 200) {
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => walkTo(Math.round(targetZ / STEP) * STEP), delay);
    }

    function step(dir) { walkTo((Math.round(targetZ / STEP) + dir) * STEP); }

    window.addEventListener('wheel', (e) => {
        if (reader.open) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? geo.vh : 1;
        const dy = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
        walkTo(targetZ + clamp(dy, -240, 240) * 0.9);
        scheduleSnap();
    }, { passive: false });

    // touch drag to walk
    let drag = null;
    let dragMoved = false;
    palace.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        drag = { id: e.pointerId, y: e.clientY, x: e.clientX, z: targetZ };
        dragMoved = false;
    });
    window.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') {
            hasMouse = true;
            // follow the cursor only while it is over the palace; outside, ease back to rest
            const { cx, cy, W, H, P } = geo;
            const top = cy - H / 2 - P, bottom = cy + H / 2;
            const inside = Math.abs(e.clientX - cx) <= W * 0.53 && e.clientY >= top && e.clientY <= bottom;
            if (inside) {
                pointer.x = clamp((e.clientX - cx) / (W / 2), -1, 1);
                pointer.y = clamp(((e.clientY - top) / (bottom - top)) * 2 - 1, -1, 1);
            } else {
                pointer.x = 0;
                pointer.y = 0;
            }
            return;
        }
        if (!drag || e.pointerId !== drag.id) return;
        const dy = drag.y - e.clientY;
        if (!dragMoved && Math.hypot(dy, drag.x - e.clientX) > 8) dragMoved = true;
        if (dragMoved) walkTo(drag.z + dy * 1.3);
    });
    const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        if (dragMoved) scheduleSnap(0);
        setTimeout(() => { dragMoved = false; }, 0);
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    document.addEventListener('mouseleave', () => { pointer.x = 0; pointer.y = 0; });

    window.addEventListener('keydown', (e) => {
        if (reader.open || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = document.activeElement?.tagName;
        const onControl = tag === 'A' || tag === 'BUTTON';
        switch (e.key) {
            case 'ArrowDown': case 'ArrowRight': case 'PageDown': step(1); break;
            case 'ArrowUp': case 'ArrowLeft': case 'PageUp': step(-1); break;
            case ' ': if (onControl) return; step(e.shiftKey ? -1 : 1); break;
            case 'Home': walkTo(0); break;
            case 'End': walkTo(maxZ); break;
            case 'Enter':
                if (onControl || hereIndex < 1) return;
                navigate(`#${thoughts[hereIndex - 1].slug}`);
                break;
            default: return;
        }
        e.preventDefault();
    });


    /* ---------------- reading ---------------- */

    /* A heading named References / Sources / Citations / Bibliography / Further
       reading in a note turns everything under it into a citation section. */
    const REF_HEADING = /^(references|sources|citations|bibliography|further reading|reading)$/i;

    function formatReferences(root) {
        for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
            const name = h.textContent.trim();
            if (!REF_HEADING.test(name)) continue;
            const level = Number(h.tagName[1]);
            const section = el('section', 'card-refs');
            section.setAttribute('aria-label', name);
            section.appendChild(el('p', 'card-refs-label', name));
            h.replaceWith(section);
            let n = section.nextSibling;
            while (n && !(n.nodeType === 1 && /^H[1-6]$/.test(n.tagName) && Number(n.tagName[1]) <= level)) {
                const next = n.nextSibling;
                section.appendChild(n);
                n = next;
            }
        }
    }

    function showReader({ color, meta, title, body, reply = false }) {
        readerCard.style.setProperty('--c', color);
        readerMeta.textContent = meta;
        readerTitle.textContent = title;
        readerBody.innerHTML = body;
        formatReferences(readerBody);
        // thought cards end with an invitation to email thoughts or reading about it
        readerReply.hidden = !reply;
        if (reply) {
            const subject = encodeURIComponent(`Re: ${title}`);
            const greeting = encodeURIComponent(`Hi David,\n\nI saw "${title}" in your memory palace.\n\n`);
            readerReplyLink.href = `mailto:${EMAIL}?subject=${subject}&body=${greeting}`;
        }
        readerCard.scrollTop = 0;
        if (!reader.open) reader.showModal();
        else { readerCard.style.animation = 'none'; void readerCard.offsetWidth; readerCard.style.animation = ''; }
    }

    function openAt(z, content) {
        clearTimeout(openTimer);
        const distance = Math.abs(z - camZ);
        walkTo(z);
        const delay = reduceMotion.matches ? 0 : Math.min(700, 120 + distance * 0.5);
        openTimer = setTimeout(() => showReader(content), delay);
    }

    function openThought(t) {
        const i = thoughts.indexOf(t);
        openAt((i + 1) * STEP, {
            color: t.color,
            meta: formatDate(t.date),
            title: t.title,
            body: t.body,
            reply: true,
        });
    }

    function openAbout() {
        openAt(0, {
            color: FACADE_COLOR,
            meta: '',
            title: "I'm David Behery",
            body: $('bio-template').innerHTML,
        });
    }

    function route() {
        const slug = decodeURIComponent(location.hash.slice(1));
        if (!slug) {
            clearTimeout(openTimer);
            if (reader.open) reader.close();
            return;
        }
        if (slug === 'about') return openAbout();
        const t = thoughts.find((x) => x.slug === slug);
        if (t) openThought(t);
    }

    function navigate(hash) {
        if (location.hash !== hash) history.pushState({ reader: true }, '', hash);
        route();
    }

    // in-page links (#slug, #about) go through our router so Back works nicely
    document.addEventListener('click', (e) => {
        const a = e.target.closest?.('a[href^="#"]');
        if (!a || e.defaultPrevented) return;
        e.preventDefault();
        // footnote links inside a note just scroll within the card
        if (a.closest('#reader-body')) {
            const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
            if (target && reader.contains(target)) target.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
            return;
        }
        if (reader.open && a.closest('#reader') == null) reader.close();
        navigate(a.getAttribute('href'));
    });

    reader.addEventListener('close', () => {
        clearTimeout(openTimer);
        if (!location.hash) return;
        if (history.state && history.state.reader) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
    });
    reader.addEventListener('click', (e) => { if (e.target === reader) reader.close(); });
    reader.querySelector('.card-close').addEventListener('click', () => reader.close());
    window.addEventListener('popstate', route);

    /* ---------------- start ---------------- */

    async function loadThoughts() {
        try {
            const res = await fetch('thoughts.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const list = await res.json();
            return list
                .filter((t) => t && t.title && t.slug)
                .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.slug).localeCompare(String(b.slug)))
                .map((t, i) => ({ ...t, no: i + 1, color: PALETTE[i % PALETTE.length] }))
                .reverse();
        } catch (err) {
            console.warn('[palace] could not load thoughts.json — showing an empty palace.', err);
            return [];
        }
    }

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(rebuildGeometry, 120);
    });

    async function start() {
        measure();
        thoughts = await loadThoughts();
        build();
        updateHere();
        requestAnimationFrame(frame);
        if (location.hash) route();
    }

    start();
})();
