// 로또 볼 추첨기 물리: 유리 통 안의 작은 공들이 바람(아래에서 위로)과 회오리,
// 가운데서 도는 교반 막대에 부딪히며 쉬지 않고 날아다닌다.
// 좌표는 통 중심 (0,0) 기준 픽셀.

export interface SimBall { x: number; y: number; vx: number; vy: number; hue: number; }

export interface LottoSim {
  R: number;          // 통 반지름
  br: number;         // 공 반지름
  balls: SimBall[];
  angle: number;      // 교반 막대 각도
  mix: number;        // 0 = 평소, 1 = 추첨 중 (부드럽게 따라감)
  mixTarget: number;
}

export const HUES = 6;

/** 공 개수에 맞춰 공 크기를 정한다 (많을수록 작게) */
export function ballRadius(R: number, count: number) {
  return R * Math.min(.1, Math.max(.058, .36 / Math.sqrt(Math.max(1, count))));
}

export function createSim(R: number, count: number, rnd = Math.random): LottoSim {
  const br = ballRadius(R, count);
  const balls: SimBall[] = Array.from({ length: count }, (_, i) => {
    const a = rnd() * Math.PI * 2, r = (R - br) * Math.sqrt(rnd()) * .9;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: (rnd() - .5) * R * 2, vy: (rnd() - .5) * R * 2, hue: i % HUES };
  });
  return { R, br, balls, angle: 0, mix: 0, mixTarget: 0 };
}

/** 창 크기가 바뀌면 통·공 크기와 위치를 같은 비율로 */
export function resizeSim(s: LottoSim, R: number) {
  if (!s.R) return;
  const k = R / s.R;
  for (const b of s.balls) { b.x *= k; b.y *= k; b.vx *= k; b.vy *= k; }
  s.R = R;
  s.br = ballRadius(R, Math.max(s.balls.length, 1));
}

/** 교반 막대: 중심을 지나는 막대 2개(십자), 길이 ±ARM·R */
export const ARM = .86;
export const armWidth = (R: number) => Math.max(2, R * .014);
export const armSpeed = (mix: number) => 1.5 + 4.5 * mix;   // 라디안/초

export function stepSim(s: LottoSim, dt: number, rnd = Math.random) {
  const { R, br } = s;
  if (!R) return;
  s.mix += (s.mixTarget - s.mix) * Math.min(1, dt * 2.5);
  const scale = R / 220;
  const omega = armSpeed(s.mix);
  const hw = armWidth(R);
  const L = ARM * R;
  const blow = .8 + 1.7 * s.mix;
  const swirl = (650 + 1900 * s.mix) * scale;
  const vmax = R * (3.2 + 1.6 * s.mix);
  const SUB = 3;
  const h = dt / SUB;
  for (let sub = 0; sub < SUB; sub++) {
    s.angle += omega * h;
    const ux = Math.cos(s.angle), uy = Math.sin(s.angle);
    for (const b of s.balls) {
      // 중력
      b.vy += 1100 * scale * h;
      // 아래쪽에서 올라오는 바람 (흔들림 포함)
      if (b.y > R * .15) {
        b.vy -= (2300 + 4300 * blow * rnd()) * scale * h;
        b.vx += (rnd() - .5) * 5200 * blow * scale * h;
      }
      // 회오리: 중심을 도는 방향으로 밀기
      const r = Math.hypot(b.x, b.y) || 1;
      const k = swirl * (r / R) * h / r;
      b.vx += -b.y * k; b.vy += b.x * k;
      // 약한 공기 저항 + 속도 제한
      b.vx *= 1 - .25 * h; b.vy *= 1 - .25 * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > vmax) { b.vx *= vmax / sp; b.vy *= vmax / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
      // 교반 막대 (십자 두 개)
      for (const [ax, ay] of [[ux, uy], [-uy, ux]] as const) {
        const t = Math.max(-L, Math.min(L, b.x * ax + b.y * ay));
        const px = t * ax, py = t * ay;
        const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = br + hw;
        if (d < min) {
          const nx = d ? dx / d : -ay, ny = d ? dy / d : ax;
          b.x = px + nx * min; b.y = py + ny * min;
          const rvx = b.vx - (-omega * py), rvy = b.vy - (omega * px);   // 막대 표면 속도를 뺀 상대 속도
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
        }
      }
      // 유리 벽
      const d = Math.hypot(b.x, b.y), lim = R - br;
      if (d > lim) {
        const nx = b.x / d, ny = b.y / d;
        b.x = nx * lim; b.y = ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.88 * vn * nx; b.vy -= 1.88 * vn * ny; }
      }
    }
    // 공끼리 부딪힘
    const bs = s.balls, min = br * 2, min2 = min * min;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j];
      const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min2) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) { const imp = rel * .96; a.vx += imp * nx; a.vy += imp * ny; c.vx -= imp * nx; c.vy -= imp * ny; }
      }
    }
  }
}

/** 배출구(맨 위)에 가장 가까운 공을 꺼낸다 */
export function takeTopBall(s: LottoSim): SimBall | undefined {
  if (!s.balls.length) return undefined;
  let best = 0;
  for (let i = 1; i < s.balls.length; i++) if (s.balls[i].y < s.balls[best].y) best = i;
  return s.balls.splice(best, 1)[0];
}

/** 새 공을 위에서 떨어뜨려 채운다 */
export function addBall(s: LottoSim, rnd = Math.random) {
  s.balls.push({ x: (rnd() - .5) * s.R * .3, y: -s.R * .6, vx: (rnd() - .5) * s.R, vy: s.R * .5, hue: Math.floor(rnd() * HUES) });
}

export function averageSpeed(s: LottoSim) {
  return s.balls.reduce((n, b) => n + Math.hypot(b.vx, b.vy), 0) / Math.max(1, s.balls.length);
}
