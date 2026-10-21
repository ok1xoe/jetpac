(function () {
    'use strict';

    var W = 256, H = 192, GROUND = 176;
    var PAL = ['#000000', '#0000d7', '#d70000', '#d700d7', '#00d700', '#00d7d7', '#d7d700', '#d7d7d7'];
    var BR = ['#000000', '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff'];
    var ALIEN_COLORS = [BR[3], BR[5], BR[6], BR[2], BR[4], BR[1]];

    var cv = document.getElementById('game');
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    var FONT = window.PIXFONT;

    function text(str, x, y, color, s, align) { FONT.draw(g, str, x, y, color, s || 1, align); }
    function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    // ---------- Zvuk (beeper) ----------
    var audio = null, muted = false;
    try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { audio = new AC(); }
    } catch (e) { audio = null; }

    function beep(freq, dur, slideTo, vol) {
        if (!audio || muted) { return; }
        try {
            var o = audio.createOscillator(), gn = audio.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(freq, audio.currentTime);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + dur); }
            gn.gain.setValueAtTime(vol || 0.03, audio.currentTime);
            gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(gn); gn.connect(audio.destination);
            o.start(); o.stop(audio.currentTime + dur);
        } catch (e) { /* ignorovat */ }
    }

    // ---------- Sprity ----------
    function mk(rows, map) {
        var c = document.createElement('canvas');
        c.width = rows[0].length; c.height = rows.length;
        var x = c.getContext('2d');
        rows.forEach(function (r, y) {
            for (var i = 0; i < r.length; i++) {
                var col = map[r.charAt(i)];
                if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
            }
        });
        return c;
    }

    var SPR = {};
    SPR.man = mk([
        '..WWWW..',
        '.WWCCCW.',
        '.WWCCCW.',
        '..WWWW..',
        '.BBWWBB.',
        'RBBWWBB.',
        'RBBWWBB.',
        'RBBBBBB.',
        '..BWWB..',
        '..B..B..',
        '..W..W..',
        '.WW..WW.'
    ], { W: BR[7], C: BR[5], B: BR[1], R: BR[2] });

    var ALIEN_ROWS = [
        // 0 meteorit
        ['..XXX...', '.XXXXX..', 'XXXWXXX.', 'XXXXXXX.', '.XXXXX..', '..XXX...', '........', '........'],
        // 1 skákací koule
        ['..XXXX..', '.XXXXXX.', 'XXWXXXXX', 'XXWXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
        // 2 pronásledovatel
        ['X..XX..X', '.X.XX.X.', '..XXXX..', '.XWXXWX.', 'XXXXXXXX', 'X.XXXX.X', 'X..XX..X', '........'],
        // 3 talíř
        ['........', '..XXXX..', '.XXWWXX.', 'XXXXXXXX', '.XWXXWX.', '..X..X..', '........', '........']
    ];
    SPR.alien = [];
    ALIEN_COLORS.forEach(function (col) {
        SPR.alien.push(ALIEN_ROWS.map(function (rows) { return mk(rows, { X: col, W: BR[7] }); }));
    });

    SPR.pod = mk([
        '..YYYY..',
        '.RRRRRR.',
        '.RYRRRR.',
        '.RYYRRR.',
        '.RYRRRR.',
        '.RYRRRR.',
        '.RRRRRR.',
        '..RRRR..'
    ], { Y: BR[6], R: BR[2] });

    SPR.gem = mk([
        '..CCCC..',
        '.CWCCCC.',
        'CWCCCCCC',
        '.CCCCCC.',
        '..CCCC..',
        '...CC...'
    ], { C: BR[5], W: BR[7] });
    SPR.coin = mk([
        '..YYYY..',
        '.YWYYYY.',
        'YWYYYYYY',
        'YYYYYYYY',
        '.YYYYYY.',
        '..YYYY..'
    ], { Y: BR[6], W: BR[7] });
    SPR.shield = mk([
        'MMMMMMMM',
        'MWMMMMMM',
        'MMMMMMMM',
        '.MMMMMM.',
        '..MMMM..',
        '...MM...'
    ], { M: BR[3], W: BR[7] });
    SPR.life = mk([
        '.WW.',
        'WCCW',
        '.BB.',
        '.BB.',
        '.WW.'
    ], { W: BR[7], C: BR[5], B: BR[1] });

    // ---------- Svět ----------
    var PLATS = [
        { x: 16, y: 72, w: 48, h: 6 },
        { x: 104, y: 112, w: 48, h: 6 },
        { x: 192, y: 56, w: 48, h: 6 },
        { x: 0, y: GROUND, w: 256, h: 16 }
    ];
    var ROCKET_X = [216, 40];
    var ALIEN_SCORE = [50, 75, 100, 60];

    var stars = [];
    (function () {
        var s = 7;
        function r() { s = (s * 16807) % 2147483647; return s / 2147483647; }
        for (var i = 0; i < 40; i++) { stars.push({ x: Math.floor(r() * W), y: Math.floor(r() * 170), c: r() < 0.3 ? 5 : 7, p: r() * 100 }); }
    })();

    // ---------- Stav ----------
    var state = 'title', stTimer = 0, frame = 0, titleT = 0;
    var score = 0, hi = 0, lives = 3, level = 1, nextLife = 10000;
    var pl, items, rocket, aliens, bullets, particles, bonuses, popups;
    var spawnT, bonusT, itemTimer, fireCd, msg, msgT, thrustSnd, launchT;
    var keys = { left: false, right: false, up: false, fire: false };

    try { hi = parseInt(localStorage.getItem('raketoplan.hi'), 10) || 0; } catch (e) { hi = 0; }

    function hitPlat(x, y, w, h) {
        for (var i = 0; i < PLATS.length; i++) {
            var p = PLATS[i];
            if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) { return p; }
        }
        return null;
    }

    function addScore(n, x, y) {
        score += n;
        if (score > hi) {
            hi = score;
            try { localStorage.setItem('raketoplan.hi', String(hi)); } catch (e) { /* ignorovat */ }
        }
        if (score >= nextLife) { lives = Math.min(lives + 1, 9); nextLife += 10000; beep(600, 0.3, 1200); showMsg('EXTRA ŽIVOT!'); }
        if (x !== undefined) { popups.push({ x: x, y: y, text: String(n), t: 45 }); }
    }

    function showMsg(t) { msg = t; msgT = 150; }

    function newGame() {
        score = 0; lives = 3; level = 1; nextLife = 10000;
        startLevel();
    }

    function startLevel() {
        rocket = { cx: ROCKET_X[(level - 1) % ROCKET_X.length], parts: 0, fuel: 0, lift: 0 };
        items = []; aliens = []; bullets = []; particles = []; bonuses = []; popups = [];
        spawnT = 90; bonusT = 600; itemTimer = 40; fireCd = 0; msg = ''; msgT = 0; thrustSnd = 0;
        resetPlayer();
        state = 'ready';
        stTimer = 100;
    }

    function resetPlayer() {
        pl = { x: 124, y: GROUND - 12, vx: 0, vy: 0, face: 1, ground: true, thrust: false, carry: null, inv: 0, shield: 0 };
    }

    // ---------- Předměty (díly rakety, nádrže) ----------
    function spawnItem() {
        var kind = rocket.parts < 3 ? 'part' : 'pod';
        var w = kind === 'part' ? 16 : 8, h = w;
        var x;
        do { x = Math.floor(rnd(8, W - 8 - w)); } while (Math.abs(x + w / 2 - rocket.cx) < 26);
        items.push({ kind: kind, idx: rocket.parts, x: x, y: -h, w: w, h: h, st: 'fall' });
    }

    function stackTop() { return GROUND - 16 * rocket.parts; }

    function updateItems() {
        if (!items.length && !(rocket.parts === 3 && rocket.fuel >= 4)) {
            if (--itemTimer <= 0) { spawnItem(); }
        }
        for (var i = items.length - 1; i >= 0; i--) {
            var it = items[i];
            if (it.st === 'fall') {
                var oy = it.y;
                it.y += 1.1;
                var p = null;
                for (var k = 0; k < PLATS.length; k++) {
                    var pp = PLATS[k];
                    if (it.x + it.w > pp.x && it.x < pp.x + pp.w && oy + it.h <= pp.y + 0.01 && it.y + it.h >= pp.y) { p = pp; break; }
                }
                if (p) { it.y = p.y - it.h; it.st = 'rest'; }
            } else if (it.st === 'carry') {
                it.x = pl.x + 4 - it.w / 2;
                it.y = pl.y + 11;
            } else if (it.st === 'drop') {
                it.y += 1.5;
                if (it.kind === 'part') {
                    if (it.y + it.h >= stackTop()) {
                        rocket.parts++;
                        items.splice(i, 1);
                        itemTimer = 60;
                        addScore(100, rocket.cx, stackTop() - 8);
                        beep(300, 0.12, 600);
                        if (rocket.parts === 3) { showMsg('RAKETA SESTAVENA - TANKUJ!'); }
                    }
                } else if (it.y + it.h >= GROUND - 48) {
                    rocket.fuel++;
                    items.splice(i, 1);
                    itemTimer = 60;
                    addScore(100, rocket.cx, GROUND - 56);
                    beep(200, 0.15, 500);
                    if (rocket.fuel >= 4) { showMsg('NASTUP DO RAKETY!'); beep(500, 0.4, 1000); }
                }
            }
        }
    }

    function handleCarry() {
        if (!pl.carry) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.st === 'drop' || it.st === 'carry') { continue; }
                if (pl.x + 1 < it.x + it.w && pl.x + 7 > it.x && pl.y < it.y + it.h && pl.y + 12 > it.y) {
                    it.st = 'carry';
                    pl.carry = it;
                    beep(700, 0.06, 900);
                    break;
                }
            }
        } else {
            var c = pl.carry;
            var top = c.kind === 'part' ? stackTop() : GROUND - 48;
            var px = pl.x + 4;
            if (Math.abs(px - rocket.cx) < 4 && c.y + c.h <= top + 1) {
                c.st = 'drop';
                c.x = rocket.cx - c.w / 2;
                pl.carry = null;
            }
        }
    }

    // ---------- Hráč ----------
    function updatePlayer() {
        var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (dir) { pl.face = dir; }

        if (pl.ground) {
            pl.vx = dir * 1.0;
        } else {
            pl.vx += dir * 0.09;
            if (!dir) { pl.vx *= 0.985; }
            pl.vx = clamp(pl.vx, -1.6, 1.6);
        }
        pl.vy += 0.07;
        pl.thrust = keys.up;
        if (keys.up) { pl.vy -= 0.17; }
        pl.vy = clamp(pl.vy, -1.6, 2.0);

        // pohyb po ose X
        var rem = pl.vx, s;
        while (Math.abs(rem) > 1e-6) {
            s = Math.abs(rem) > 1 ? (rem > 0 ? 1 : -1) : rem;
            pl.x += s;
            if (hitPlat(pl.x + 1, pl.y, 6, 12)) { pl.x -= s; pl.vx = 0; break; }
            rem -= s;
        }
        // pohyb po ose Y
        pl.ground = false;
        rem = pl.vy;
        while (Math.abs(rem) > 1e-6) {
            s = Math.abs(rem) > 1 ? (rem > 0 ? 1 : -1) : rem;
            pl.y += s;
            if (hitPlat(pl.x + 1, pl.y, 6, 12)) {
                pl.y -= s;
                if (s > 0) { pl.ground = true; pl.vy = 0; } else { pl.vy = 0.4; }
                break;
            }
            rem -= s;
        }
        if (pl.x > W) { pl.x = -8; } else if (pl.x < -8) { pl.x = W; }
        if (pl.y < -4) { pl.y = -4; if (pl.vy < 0) { pl.vy = 0; } }
        if (pl.inv > 0) { pl.inv--; }
        if (pl.shield > 0) { pl.shield--; }

        if (keys.up && --thrustSnd <= 0) { thrustSnd = 5; beep(rnd(70, 110), 0.05, null, 0.015); }

        if (fireCd > 0) { fireCd--; }
        if (keys.fire && fireCd <= 0 && bullets.length < 3) {
            bullets.push({ x: pl.face > 0 ? pl.x + 8 : pl.x - 10, y: pl.y + 5, vx: pl.face * 5, w: 10 });
            fireCd = 7;
            beep(1200, 0.07, 300, 0.02);
        }
    }

    // ---------- Mimozemšťané ----------
    function alienTypes() {
        return level <= 1 ? [0, 3] : level === 2 ? [0, 3, 1] : [0, 1, 2, 3];
    }

    function spawnAlien() {
        var types = alienTypes();
        var t = types[Math.floor(Math.random() * types.length)];
        var left = Math.random() < 0.5;
        var sp = 0.45 + 0.07 * Math.min(level, 10);
        var a = { t: t, x: left ? -8 : W, y: rnd(10, 130), vx: 0, vy: 0, age: 0, y0: 0, dir: left ? 1 : -1 };
        a.y0 = a.y;
        if (t === 0) { a.vx = a.dir * (sp + rnd(0.2, 0.5)); a.vy = rnd(0.25, 0.7); a.y = rnd(6, 90); }
        else if (t === 1) { a.vx = a.dir * sp; a.vy = 0; a.y = rnd(20, 100); }
        else if (t === 2) { a.x = rnd(0, W - 8); a.y = -8; }
        else { a.vx = a.dir * (sp + 0.3); a.y0 = rnd(25, 135); a.y = a.y0; }
        aliens.push(a);
    }

    function explode(x, y, color, n) {
        for (var i = 0; i < (n || 14); i++) {
            var an = Math.random() * 6.283, sp = rnd(0.3, 2);
            particles.push({ x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: rnd(15, 35), c: color });
        }
    }

    function killAlien(a, byPlayer) {
        a.dead = true;
        explode(a.x + 4, a.y + 4, ALIEN_COLORS[(level - 1) % ALIEN_COLORS.length], 14);
        beep(220, 0.18, 40, 0.03);
        if (byPlayer) { addScore(ALIEN_SCORE[a.t], a.x, a.y); }
    }

    function updateAliens() {
        var maxA = Math.min(4 + level, 9);
        var interval = Math.max(28, 110 - 8 * level);
        if (--spawnT <= 0) {
            spawnT = interval;
            if (aliens.length < maxA) { spawnAlien(); }
        }
        var sp = 0.45 + 0.07 * Math.min(level, 10);
        aliens.forEach(function (a) {
            a.age++;
            if (a.t === 0) {
                a.x += a.vx; a.y += a.vy;
                if (hitPlat(a.x + 1, a.y + 1, 6, 6)) { killAlien(a, false); }
                if (a.x < -12 || a.x > W + 4 || a.y > H) { a.dead = true; }
            } else if (a.t === 1) {
                a.vy += 0.05;
                var nx = a.x + a.vx;
                if (hitPlat(nx, a.y, 8, 8)) { a.vx = -a.vx; } else { a.x = nx; }
                var ny = a.y + a.vy;
                if (hitPlat(a.x, ny, 8, 8)) { a.vy = a.vy > 0 ? -2.4 : Math.abs(a.vy); } else { a.y = ny; }
                if (a.x > W) { a.x = -8; } else if (a.x < -8) { a.x = W; }
                if (a.age > 1500) { killAlien(a, false); }
            } else if (a.t === 2) {
                var dx = pl.x - a.x, dy = pl.y - a.y;
                var d = Math.sqrt(dx * dx + dy * dy) || 1;
                var v = sp * 0.75;
                a.x += dx / d * v; a.y += dy / d * v;
                if (a.age > 1500) { killAlien(a, false); }
            } else {
                a.x += a.vx;
                a.y = a.y0 + Math.sin(a.age * 0.06) * 18;
                if (a.x < -14 || a.x > W + 6) { a.dead = true; }
            }
        });
        aliens = aliens.filter(function (a) { return !a.dead; });
    }

    function updateBullets() {
        bullets.forEach(function (b) {
            b.x += b.vx;
            var front = b.vx > 0 ? b.x + b.w : b.x;
            if (front < 0 || front > W || hitPlat(front - (b.vx > 0 ? 2 : 0), b.y, 2, 1)) { b.dead = true; return; }
            aliens.forEach(function (a) {
                if (!a.dead && !b.dead && b.x < a.x + 8 && b.x + b.w > a.x && b.y >= a.y && b.y <= a.y + 8) {
                    killAlien(a, true);
                    b.dead = true;
                }
            });
        });
        bullets = bullets.filter(function (b) { return !b.dead; });
    }

    // ---------- Bonusy ----------
    function updateBonuses() {
        if (--bonusT <= 0 && !bonuses.length) {
            bonusT = Math.floor(rnd(900, 1500));
            bonuses.push({ kind: Math.floor(Math.random() * 3), x: Math.floor(rnd(10, W - 18)), y: -8, st: 'fall', t: 700 });
        }
        bonuses.forEach(function (b) {
            if (b.st === 'fall') {
                var oy = b.y;
                b.y += 0.9;
                PLATS.forEach(function (p) {
                    if (b.st === 'fall' && b.x + 8 > p.x && b.x < p.x + p.w && oy + 8 <= p.y + 0.01 && b.y + 8 >= p.y) {
                        b.y = p.y - 8; b.st = 'rest';
                    }
                });
            } else {
                b.t--;
            }
            if (pl.x + 1 < b.x + 8 && pl.x + 7 > b.x && pl.y < b.y + 8 && pl.y + 12 > b.y) {
                b.dead = true;
                if (b.kind === 0) { addScore(250, b.x, b.y); }
                else if (b.kind === 1) { addScore(500, b.x, b.y); }
                else { addScore(100, b.x, b.y); pl.shield = 480; showMsg('ŠTÍT!'); }
                beep(800, 0.2, 1600);
            }
            if (b.t <= 0) { b.dead = true; }
        });
        bonuses = bonuses.filter(function (b) { return !b.dead; });
    }

    // ---------- Smrt a vzlet ----------
    function checkPlayerHit() {
        if (pl.inv > 0 || pl.shield > 0) { return; }
        for (var i = 0; i < aliens.length; i++) {
            var a = aliens[i];
            if (pl.x + 1 < a.x + 7 && pl.x + 7 > a.x + 1 && pl.y + 1 < a.y + 7 && pl.y + 11 > a.y + 1) {
                killPlayer();
                return;
            }
        }
    }

    function killPlayer() {
        explode(pl.x + 4, pl.y + 6, BR[7], 20);
        explode(pl.x + 4, pl.y + 6, BR[5], 14);
        beep(400, 0.8, 30, 0.04);
        if (pl.carry) { pl.carry.st = 'fall'; pl.carry = null; }
        state = 'dying';
        stTimer = 70;
    }

    function rocketRect() { return { x: rocket.cx - 8, y: GROUND - 48, w: 16, h: 48 }; }

    function checkBoard() {
        if (rocket.parts === 3 && rocket.fuel >= 4) {
            var r = rocketRect();
            if (pl.x + 1 < r.x + r.w && pl.x + 7 > r.x && pl.y < r.y + r.h && pl.y + 12 > r.y) {
                state = 'launch';
                stTimer = 0;
                rocket.lift = 0;
                aliens = []; bullets = [];
                beep(100, 1.5, 700, 0.04);
            }
        }
    }

    // ---------- Aktualizace ----------
    function updateParticles() {
        particles.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.t--; });
        particles = particles.filter(function (p) { return p.t > 0; });
        popups.forEach(function (p) { p.t--; p.y -= 0.3; });
        popups = popups.filter(function (p) { return p.t > 0; });
        if (msgT > 0) { msgT--; }
    }

    function step() {
        frame++;
        switch (state) {
            case 'title':
                titleT++;
                break;
            case 'ready':
                updatePlayer();
                updateItems();
                updateParticles();
                if (--stTimer <= 0) { state = 'play'; }
                break;
            case 'play':
                updatePlayer();
                handleCarry();
                updateItems();
                updateAliens();
                updateBullets();
                updateBonuses();
                updateParticles();
                checkPlayerHit();
                if (state === 'play') { checkBoard(); }
                break;
            case 'dying':
                updateParticles();
                updateItems();
                if (--stTimer <= 0) {
                    lives--;
                    if (lives < 0) {
                        state = 'over';
                        stTimer = 0;
                    } else {
                        aliens = []; bullets = [];
                        resetPlayer();
                        pl.inv = 150;
                        state = 'play';
                    }
                }
                break;
            case 'launch':
                stTimer++;
                if (stTimer > 60) {
                    rocket.lift += (stTimer - 60) * 0.045;
                    if (stTimer % 3 === 0) {
                        particles.push({ x: rocket.cx + rnd(-4, 4), y: GROUND - rocket.lift + rnd(0, 4), vx: rnd(-0.6, 0.6), vy: rnd(0.5, 1.8), t: 22, c: Math.random() < 0.5 ? BR[6] : BR[2] });
                    }
                }
                updateParticles();
                if (rocket.lift > 200) {
                    addScore(1000);
                    level++;
                    startLevel();
                }
                break;
            case 'over':
                stTimer++;
                updateParticles();
                break;
        }
    }

    // ---------- Kreslení ----------
    function drawRocketPart(kind, x, y) {
        if (kind === 0) {            // spodní díl s křídly
            rect(x + 3, y, 10, 16, BR[7]);
            rect(x + 3, y + 8, 10, 2, BR[2]);
            rect(x, y + 9, 3, 7, BR[2]);
            rect(x + 13, y + 9, 3, 7, BR[2]);
            rect(x + 5, y + 14, 6, 2, PAL[1]);
        } else if (kind === 1) {     // střední díl s okénkem
            rect(x + 3, y, 10, 16, BR[7]);
            rect(x + 6, y + 4, 4, 5, BR[5]);
            rect(x + 3, y + 12, 10, 2, BR[2]);
        } else {                     // špička
            for (var i = 0; i < 16; i++) {
                var w = 2 + Math.floor(i * 0.65);
                rect(x + 8 - Math.floor(w / 2), y + i, w, 1, i < 7 ? BR[2] : BR[7]);
            }
        }
    }

    function drawRocket() {
        var oy = state === 'launch' ? -rocket.lift : 0;
        var shake = (state === 'launch' && stTimer < 60) ? ((frame % 2) ? 1 : -1) : 0;
        var x = rocket.cx - 8 + shake;
        for (var i = 0; i < rocket.parts; i++) {
            drawRocketPart(i, x, GROUND - 16 * (i + 1) + oy);
        }
        if (state === 'launch' && stTimer > 20) {
            var fh = Math.min(26, (stTimer - 20) * 0.7) + (frame % 3);
            rect(rocket.cx - 4, GROUND + oy, 8, fh, BR[6]);
            rect(rocket.cx - 2, GROUND + oy, 4, fh * 0.7, BR[2]);
        }
        // ukazatel paliva
        if (rocket.parts === 3 && state !== 'launch') {
            for (var f = 0; f < 4; f++) {
                rect(rocket.cx + 11, GROUND - 6 - f * 6, 4, 4, f < rocket.fuel ? BR[6] : PAL[1]);
            }
        }
    }

    function drawPlayer() {
        if (state === 'dying' || state === 'launch') { return; }
        if (pl.inv > 0 && frame % 4 < 2) { return; }
        var x = Math.round(pl.x), y = Math.round(pl.y);
        if (pl.thrust) {
            var fx = pl.face > 0 ? x - 1 : x + 7;
            rect(fx, y + 8, 2, 3 + (frame % 3), BR[6]);
            rect(fx, y + 8, 2, 2, BR[2]);
        }
        if (pl.face > 0) {
            g.drawImage(SPR.man, x, y);
        } else {
            g.save();
            g.translate(x + 8, y);
            g.scale(-1, 1);
            g.drawImage(SPR.man, 0, 0);
            g.restore();
        }
        if (pl.shield > 0 && (pl.shield > 90 || frame % 6 < 3)) {
            g.strokeStyle = BR[3];
            g.lineWidth = 1;
            g.strokeRect(x - 1.5, y - 1.5, 11, 15);
        }
    }

    function drawItem(it) {
        if (it.kind === 'part') {
            drawRocketPart(it.idx, Math.round(it.x), Math.round(it.y));
        } else {
            g.drawImage(SPR.pod, Math.round(it.x), Math.round(it.y));
        }
    }

    function drawWorld() {
        // hvězdy
        stars.forEach(function (s) {
            if ((frame + s.p) % 60 < 50) { rect(s.x, s.y, 1, 1, PAL[s.c]); }
        });
        // plošiny
        PLATS.forEach(function (p, i) {
            if (i === PLATS.length - 1) {
                rect(p.x, p.y, p.w, p.h, PAL[4]);
                rect(p.x, p.y, p.w, 2, BR[4]);
                for (var x = 0; x < W; x += 8) { rect(x + (x / 8 % 2) * 3, p.y + 5, 2, 1, BR[4]); rect(x + 4, p.y + 9, 1, 1, BR[6]); }
            } else {
                rect(p.x, p.y, p.w, p.h, PAL[4]);
                rect(p.x, p.y, p.w, 2, BR[4]);
                rect(p.x, p.y + 4, p.w, 1, PAL[5]);
            }
        });
    }

    function drawHud() {
        text('1UP', 6, 3, BR[5], 1);
        text(pad(score, 6), 6, 12, BR[7], 1);
        text('REKORD', W / 2, 3, BR[2], 1, 'center');
        text(pad(hi, 6), W / 2, 12, BR[7], 1, 'center');
        // životy
        for (var i = 0; i < Math.min(lives, 5); i++) { g.drawImage(SPR.life, W - 8 - (i + 1) * 6, 3); }
        if (lives > 5) { text('+' + (lives - 5), W - 6, 10, BR[7], 1, 'right'); }
        // spodní lišta
        text('ÚROVEŇ ' + level, 6, 181, PAL[0], 1);
        var info = rocket.parts < 3 ? 'DÍLY ' + rocket.parts + '/3' : rocket.fuel < 4 ? 'PALIVO ' + rocket.fuel + '/4' : 'VZLET!';
        text(info, W - 6, 181, PAL[0], 1, 'right');
    }

    function pad(n, len) { var s = String(n); while (s.length < len) { s = '0' + s; } return s; }

    function drawTitle() {
        var y = 28 + Math.round(Math.sin(titleT * 0.05) * 3);
        text('RAKETOPLÁN', W / 2 + 2, y + 2, BR[2], 3, 'center');
        text('RAKETOPLÁN', W / 2, y, BR[6], 3, 'center');
        text('SESTAV RAKETU, NATANKUJ A UTEČ!', W / 2, 62, BR[5], 1, 'center');
        // ukázkový panáček a mimozemšťané
        g.drawImage(SPR.man, 40, 84);
        g.drawImage(SPR.pod, 200, 90);
        for (var i = 0; i < 4; i++) { g.drawImage(SPR.alien[i][i], 70 + i * 28, 92); }
        text('1UP  ' + pad(score, 6) + '   REKORD ' + pad(hi, 6), W / 2, 116, BR[7], 1, 'center');
        text('ŠIPKY / WASD = POHYB, NAHORU = TRYSKA', W / 2, 134, PAL[7], 1, 'center');
        text('MEZERNÍK = STŘELBA   P = PAUZA', W / 2, 146, PAL[7], 1, 'center');
        if (Math.floor(titleT / 30) % 2 === 0) { text('STISKNI ENTER NEBO MEZERNÍK', W / 2, 164, BR[4], 1, 'center'); }
    }

    function draw() {
        rect(0, 0, W, H, PAL[0]);
        if (state === 'title') {
            drawWorld();
            drawTitle();
            return;
        }
        drawWorld();
        drawRocket();
        items.forEach(drawItem);

        bonuses.forEach(function (b) {
            if (b.st === 'rest' && b.t < 180 && frame % 8 < 4) { return; }
            g.drawImage(b.kind === 0 ? SPR.gem : b.kind === 1 ? SPR.coin : SPR.shield, Math.round(b.x), Math.round(b.y));
        });

        aliens.forEach(function (a) {
            var set = SPR.alien[(level - 1) % ALIEN_COLORS.length];
            g.drawImage(set[a.t], Math.round(a.x), Math.round(a.y));
        });

        bullets.forEach(function (b) {
            var col = [BR[7], BR[5], BR[6]][frame % 3];
            rect(b.x, b.y, b.w, 1, col);
            rect(b.vx > 0 ? b.x + b.w - 3 : b.x, b.y - 1, 3, 3, col);
        });

        drawPlayer();

        particles.forEach(function (p) { rect(p.x, p.y, 2, 2, p.c); });
        popups.forEach(function (p) { text(p.text, p.x, p.y, BR[7], 1); });
        drawHud();

        if (msgT > 0 && (msgT > 30 || frame % 6 < 3)) { text(msg, W / 2, 24, BR[6], 1, 'center'); }

        if (state === 'ready') {
            text('ÚROVEŇ ' + level, W / 2, 80, BR[7], 2, 'center');
            text('PŘIPRAV SE!', W / 2, 100, BR[6], 1, 'center');
        } else if (state === 'paused') {
            rect(60, 70, 136, 40, PAL[0]);
            g.strokeStyle = BR[7]; g.strokeRect(60.5, 70.5, 135, 39);
            text('PAUZA', W / 2, 80, BR[6], 2, 'center');
            text('P NEBO ENTER = POKRAČOVAT', W / 2, 98, BR[7], 1, 'center');
        } else if (state === 'over') {
            rect(40, 66, 176, 56, PAL[0]);
            g.strokeStyle = BR[2]; g.strokeRect(40.5, 66.5, 175, 55);
            text('KONEC HRY', W / 2, 74, BR[2], 2, 'center');
            text('SKÓRE ' + pad(score, 6), W / 2, 96, BR[7], 1, 'center');
            if (Math.floor(stTimer / 30) % 2 === 0) { text('ENTER = NOVÁ HRA', W / 2, 108, BR[4], 1, 'center'); }
        }
    }

    // ---------- Vstup ----------
    var prevState = 'play';

    function startPress() {
        if (audio && audio.state === 'suspended') { try { audio.resume(); } catch (e) { /* ignorovat */ } }
        if (state === 'title' || (state === 'over' && stTimer > 40)) { newGame(); return true; }
        if (state === 'paused') { state = prevState; return true; }
        return false;
    }

    function togglePause() {
        if (state === 'paused') { state = prevState; }
        else if (state === 'play' || state === 'ready') { prevState = state; state = 'paused'; }
    }

    var KEYMAP = { 37: 'left', 65: 'left', 39: 'right', 68: 'right', 38: 'up', 87: 'up', 32: 'fire', 13: 'fire' };

    document.addEventListener('keydown', function (e) {
        var k = KEYMAP[e.keyCode];
        if (k) {
            e.preventDefault();
            if (!keys[k] && (k === 'fire')) { startPress(); }
            keys[k] = true;
        } else if (e.keyCode === 80) {
            togglePause();
        } else if (e.keyCode === 77) {
            muted = !muted;
        }
    });
    document.addEventListener('keyup', function (e) {
        var k = KEYMAP[e.keyCode];
        if (k) { keys[k] = false; }
    });

    // dotyková tlačítka
    var buttons = document.querySelectorAll ? document.querySelectorAll('#touch button') : [];
    Array.prototype.forEach.call(buttons, function (b) {
        var k = b.getAttribute('data-k');
        function down(e) { e.preventDefault(); if (k === 'fire') { startPress(); } keys[k] = true; }
        function up(e) { e.preventDefault(); keys[k] = false; }
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
    });
    cv.addEventListener('pointerdown', function () { if (!startPress() && (state === 'play')) { /* dotyk do hry nic nedělá */ } });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && state === 'play') { prevState = state; state = 'paused'; }
    });

    // ---------- Změna velikosti ----------
    function resize() {
        try {
            var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
            var aw = window.innerWidth, ah = window.innerHeight - (coarse ? 100 : 60);
            var s = Math.min(aw / W, ah / H);
            s = s >= 1 ? Math.floor(s) : s;
            cv.style.width = Math.floor(W * s) + 'px';
            cv.style.height = Math.floor(H * s) + 'px';
        } catch (e) { /* ignorovat */ }
    }
    window.addEventListener('resize', resize);
    resize();

    // ---------- Smyčka ----------
    var last = 0, acc = 0;
    function loop(ts) {
        var dt = (ts - last) / 1000 || 0;
        last = ts;
        acc += Math.min(dt, 0.25);
        var n = 0;
        while (acc >= 1 / 60 && n++ < 6) { step(); acc -= 1 / 60; }
        draw();
        requestAnimationFrame(loop);
    }

    pl = { x: 124, y: GROUND - 12, vx: 0, vy: 0, face: 1, ground: true, thrust: false, carry: null, inv: 0, shield: 0 };
    rocket = { cx: ROCKET_X[0], parts: 0, fuel: 0, lift: 0 };
    items = []; aliens = []; bullets = []; particles = []; bonuses = []; popups = [];
    requestAnimationFrame(loop);
})();
