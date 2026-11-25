// One ffmpeg command: per clip trim + 9:16 fit + text overlay + loud-spot dips, joined with cuts or
// transitions, then optional music.
// clips: [{ path, start, dur, hasAudio, trans? (to next clip, xfade name or 'cut'), dips?: [{t0,t1,gain}] }]
// music: { path, vol? (1 = original loudness) } | null
// overlays: [{ path (full-frame transparent png), t0, t1 }] shown on the joined video between t0 and t1 seconds
export const TRANS_SEC = 0.4;

// Text effects. T = seconds since the text appeared, D = how long it shows.
// in/out: fade seconds; dx, dy: offset as a share of the frame; s: scale; blink: on 0.55 s of every 0.8 s.
// Expressions use ffmpeg syntax; the preview evaluates the very same strings (fxAt), so both move alike.
export const FX = {
  none: {},
  fade: { in: 0.35, out: 0.35 },
  up: { in: 0.3, out: 0.3, dy: '0.08*pow(1-clip(T/0.45,0,1),3)' },
  left: { out: 0.3, dx: '-0.7*pow(1-clip(T/0.45,0,1),3)' },
  pop: { in: 0.12, out: 0.25, s: 'if(lt(T,0.25),0.3+0.85*T/0.25,if(lt(T,0.4),1.15-T+0.25,1))' },
  bounce: { dy: '-0.025*abs(sin(2*PI*1.6*T))' },
  shake: { dx: '0.012*sin(2*PI*4*T)' },
  blink: { blink: true },
};
const fns = { clip: (v, a, b) => Math.min(b, Math.max(a, v)), pow: Math.pow, abs: Math.abs, sin: Math.sin,
  lt: (a, b) => +(a < b), mod: (a, b) => a - b * Math.floor(a / b), if: (c, a, b) => (c ? a : b), PI: Math.PI };
const compiled = new Map();
const ev = (e, T, D) => {
  if (!compiled.has(e)) compiled.set(e, new Function('f', 'T', 'D', `with (f) { return ${e.replace(/\bif\(/g, 'f.if(')}; }`));
  return compiled.get(e)(fns, T, D);
};
// the effect's state at T seconds after the text appeared: { a (opacity), dx, dy, s }
export function fxAt(name, T, D) {
  const fx = FX[name] || FX.none;
  let a = 1;
  if (fx.in) a *= fns.clip(T / fx.in, 0, 1);
  if (fx.out) a *= fns.clip((D - T) / fx.out, 0, 1);
  if (fx.blink) a *= fns.lt(fns.mod(T, 0.8), 0.55);
  return { a, dx: fx.dx ? ev(fx.dx, T, D) : 0, dy: fx.dy ? ev(fx.dy, T, D) : 0, s: fx.s ? ev(fx.s, T, D) : 1 };
}

export function buildArgs({ clips, overlays = [], music, keepOrig, fit, W, H, out = 'out.mp4', trSec = TRANS_SEC }) {
  const a = ['-hide_banner'], f = [];
  let n = 0;
  const AF = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const scale = fit === 'cover'
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`;

  clips.forEach((c, i) => {
    const t = c.dur.toFixed(3);
    a.push('-ss', c.start.toFixed(3), '-t', t, '-i', c.path);
    const vi = n++;
    // settb: xfade needs identical timebases on both sides
    // tpad: if the picture runs out early, hold its last frame so the clip keeps its length and sound stays in sync
    const v = `[${vi}:v]${scale},setsar=1,fps=30,settb=AVTB,tpad=stop_mode=clone:stop_duration=${t},trim=duration=${t}`;
    f.push(`${v},format=yuv420p[v${i}]`);
    if (keepOrig) {
      let ai = vi;
      if (!c.hasAudio) { a.push('-f', 'lavfi', '-t', t, '-i', 'anullsrc=r=44100:cl=stereo'); ai = n++; }
      const dips = (c.dips || []).map((d) => `,volume=volume=${d.gain}:enable='between(t,${d.t0.toFixed(2)},${d.t1.toFixed(2)})'`).join('');
      // pad/trim so audio length always equals the clip, otherwise later clips drift out of sync
      f.push(`[${ai}:a]${AF}${dips},apad,atrim=duration=${t}[a${i}]`);
    }
  });

  let vc = '[v0]', ac = keepOrig ? '[a0]' : null, total = clips[0].dur;
  for (let i = 1; i < clips.length; i++) {
    const tr = clips[i - 1].trans || 'cut';
    const d = Math.min(trSec, clips[i - 1].dur / 2, clips[i].dur / 2);
    if (tr === 'cut') {
      f.push(`${vc}[v${i}]concat=n=2:v=1:a=0[vj${i}]`);
      if (ac) f.push(`${ac}[a${i}]concat=n=2:v=0:a=1[aj${i}]`);
      total += clips[i].dur;
    } else {
      f.push(`${vc}[v${i}]xfade=transition=${tr}:duration=${d.toFixed(3)}:offset=${(total - d).toFixed(3)}[vj${i}]`);
      if (ac) f.push(`${ac}[a${i}]acrossfade=d=${d.toFixed(3)}[aj${i}]`);
      total += clips[i].dur - d;
    }
    vc = `[vj${i}]`;
    if (ac) ac = `[aj${i}]`;
  }

  overlays.forEach((o, k) => {
    const t0 = o.t0.toFixed(2), t1 = o.t1.toFixed(2), on = `between(t,${t0},${t1})`;
    const fx = FX[o.fx] || FX.none;
    if (!o.w || o.fx == null || o.fx === 'none') { // still picture
      a.push('-i', o.path);
      f.push(`${vc}[${n++}:v]overlay=${o.x || 0}:${o.y || 0}:enable='${on}'[vo${k}]`);
    } else { // the text box as a moving stream on the joined video's clock
      a.push('-loop', '1', '-framerate', '30', '-t', (o.t1 + 0.1).toFixed(2), '-i', o.path);
      const ex = (e) => e.replaceAll('T', `(t-${t0})`).replaceAll('D', (o.t1 - o.t0).toFixed(2));
      let s = `[${n++}:v]format=rgba`;
      if (fx.in) s += `,fade=t=in:st=${t0}:d=${fx.in}:alpha=1`;
      if (fx.out) s += `,fade=t=out:st=${Math.max(o.t0, o.t1 - fx.out).toFixed(2)}:d=${fx.out}:alpha=1`;
      if (fx.s) s += `,scale=w='max(2,trunc(${o.w}*${ex(fx.s)}/2)*2)':h='max(2,trunc(${o.h}*${ex(fx.s)}/2)*2)':eval=frame`;
      f.push(`${s}[ly${k}]`);
      const x = `${o.x}+(${o.w}-w)/2+${W}*(${ex(fx.dx || '0')})`, y = `${o.y}+(${o.h}-h)/2+${H}*(${ex(fx.dy || '0')})`;
      const en = fx.blink ? `${on}*lt(mod(t-${t0},0.8),0.55)` : on;
      f.push(`${vc}[ly${k}]overlay=x='${x}':y='${y}':eval=frame:enable='${en}'[vo${k}]`);
    }
    vc = `[vo${k}]`;
  });

  let aout = ac;
  if (music) {
    a.push('-i', music.path);
    const mi = n++;
    const T = total.toFixed(3), st = Math.max(0, total - 1.5).toFixed(3);
    f.push(`[${mi}:a]${AF},apad,atrim=duration=${T},afade=t=out:st=${st}:d=1.5,volume=${music.vol ?? (keepOrig ? 0.6 : 1)}[m]`);
    if (ac) {
      f.push(`${ac}[m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[mix]`);
      aout = '[mix]';
    } else aout = '[m]';
  }

  a.push('-filter_complex', f.join(';'), '-map', vc);
  if (aout) a.push('-map', aout, '-c:a', 'aac', '-b:a', '128k');
  a.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-y', out);
  return { args: a, total };
}
