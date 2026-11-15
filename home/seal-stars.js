// 동키 인장 주위의 은하수: 금빛 점들이 천천히 돌다가, 가끔 흩어졌다가 다시 고리로 모인다.
// 마우스를 가까이 대면 점들이 살짝 비켜난다. 움직임 줄이기 설정이면 멈춘 한 장면만 그린다.
const seal = document.querySelector('.seal');
const canvas = seal?.querySelector('.seal-stars');

if (canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  // 색: 샴페인 골드 · 진한 골드 · 잉크 네이비(대비용 소수)
  const COLORS = { gold: [201, 163, 90], light: [226, 194, 122], deep: [169, 133, 63], ink: [21, 25, 43] };

  // 단위: S = 인장 바깥 반지름(px). 동키가 그려진 안쪽 원은 0.74S.
  const stars = Array.from({ length: 260 }, () => {
    const halo = Math.random() < .2;                          // 고리 바깥의 성긴 별
    const r = halo ? rand(1.1, 1.5) : .8 + Math.random() ** 1.6 * .24;
    const tone = Math.random();
    return {
      a: rand(0, TAU),
      r,
      w: (halo ? .025 : .07) * (1.25 - r * .45) * (Math.random() < .12 ? -1 : 1), // 각속도(라디안/초), 일부는 역방향
      size: Math.random() < .07 ? rand(1.7, 2.6) : rand(.45, 1.25),
      color: tone < .12 ? 'ink' : tone < .45 ? 'light' : tone < .8 ? 'gold' : 'deep',
      alpha: halo ? rand(.25, .6) : rand(.45, .95),
      tw: rand(0, TAU), tws: rand(.7, 2),                      // 반짝임
      sa: rand(-1.1, 1.1), sr: rand(1.3, 1.95),                // 흩어질 때의 각도 차이·반지름 배율
      wob: rand(0, TAU),
      delay: Math.random() * .45,                              // 흩어지고 모이는 시차
      ox: 0, oy: 0,                                            // 마우스로 밀린 거리
    };
  });

  // 12초 주기: 모여서 돌기 → 흩어지기 → 잠시 머물기 → 다시 모이기
  const CYCLE = 12;
  function scatterAmount(t, d) {
    const out0 = 6.4 + d, out1 = out0 + 2.3, in0 = 9.1 + d, in1 = in0 + 2.4;
    if (t < out0) return 0;
    if (t < out1) return ease((t - out0) / (out1 - out0));
    if (t < in0) return 1;
    if (t < in1) return 1 - ease((t - in0) / (in1 - in0));
    return 0;
  }

  let W = 0, H = 0, S = 0, dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    S = seal.clientWidth * (116 / 240);
  }

  const mouse = { x: 0, y: 0, on: false };
  addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left - W / 2;
    mouse.y = e.clientY - rect.top - H / 2;
    mouse.on = Math.hypot(mouse.x, mouse.y) < S * 2.2;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mouse.on = false; });

  // 첫 화면: 흩어진 상태에서 모여드는 장면으로 시작
  const t0 = performance.now() - 9.0 * 1000;

  function draw(now) {
    const time = (now - t0) / 1000;
    const t = time % CYCLE;
    const cx = W / 2, cy = H / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 인장 뒤의 은은한 금빛 후광
    const glow = ctx.createRadialGradient(cx, cy, S * .7, cx, cy, S * 1.6);
    glow.addColorStop(0, 'rgba(217,180,95,.16)');
    glow.addColorStop(1, 'rgba(217,180,95,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // 가는 궤도선 (모여 있을 때 더 또렷하게)
    const together = 1 - scatterAmount(t, .2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(169,133,63,${.10 + together * .14})`;
    ctx.beginPath(); ctx.arc(cx, cy, S * .91, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(169,133,63,${.05 + together * .07})`;
    ctx.beginPath(); ctx.arc(cx, cy, S * 1.04, 0, TAU); ctx.stroke();

    const fadeStart = Math.min(W, H) / 2 - S * .45, fadeEnd = Math.min(W, H) / 2 - 2;
    for (const p of stars) {
      const m = reduce ? 0 : scatterAmount(t, p.delay * 1.2);
      const ang = p.a + p.w * time + p.sa * m + Math.sin(time * .6 + p.wob) * .05 * m;
      const rad = p.r * S * (1 + (p.sr - 1) * m) + Math.sin(time * .9 + p.wob) * S * .015;
      let x = Math.cos(ang) * rad, y = Math.sin(ang) * rad * .96;

      // 마우스 근처의 점은 비켜났다가 제자리로
      let tx = 0, ty = 0;
      if (mouse.on) {
        const dx = x - mouse.x, dy = y - mouse.y, d = Math.hypot(dx, dy), R = S * .55;
        if (d < R) { const f = (1 - d / R) ** 2 * S * .45; tx = (dx / (d || 1)) * f; ty = (dy / (d || 1)) * f; }
      }
      p.ox += (tx - p.ox) * .08; p.oy += (ty - p.oy) * .08;
      x += p.ox; y += p.oy;

      const dist = Math.hypot(x, y);
      const edge = dist > fadeStart ? Math.max(0, 1 - (dist - fadeStart) / (fadeEnd - fadeStart)) : 1;
      const twinkle = .6 + .4 * Math.sin(p.tw + time * p.tws);
      const a = p.alpha * twinkle * edge * (1 - m * .3);
      if (a < .02) continue;
      const [r, g, b] = COLORS[p.color];
      const px = cx + x, py = cy + y;

      if (p.size > 1.6) {
        // 큰 별: 부드러운 빛 + 가는 십자 광채
        const halo = ctx.createRadialGradient(px, py, 0, px, py, p.size * 4);
        halo.addColorStop(0, `rgba(${r},${g},${b},${a * .45})`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(px, py, p.size * 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${r},${g},${b},${a * .55})`;
        ctx.lineWidth = .7;
        const L = p.size * 3.2 * twinkle;
        ctx.beginPath(); ctx.moveTo(px - L, py); ctx.lineTo(px + L, py); ctx.moveTo(px, py - L); ctx.lineTo(px, py + L); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, TAU); ctx.fill();
    }
  }

  let raf = 0, visible = true;
  const loop = now => { draw(now); raf = requestAnimationFrame(loop); };
  const start = () => { if (!raf && !reduce && visible) raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  new ResizeObserver(() => { resize(); if (reduce || !raf) draw(performance.now()); }).observe(seal);
  // 화면 밖에 있으면 멈춰서 배터리를 아낀다
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(canvas);
  resize();
  if (reduce) draw(t0 + 2000); else start();
}
