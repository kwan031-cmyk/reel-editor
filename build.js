// One ffmpeg command: per clip trim + 9:16 fit + text overlay + loud-spot dips, joined with cuts or
// transitions, then optional music.
// clips: [{ path, start, dur, hasAudio, textPath?, trans? (to next clip, xfade name or 'cut'), dips?: [{t0,t1,gain}] }]
// music: { path, vol? (1 = original loudness) } | null
// overlays: [{ path (full-frame transparent png), t0, t1 }] shown on the joined video between t0 and t1 seconds
export const TRANS_SEC = 0.4;

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
    let v = `[${vi}:v]${scale},setsar=1,fps=30,settb=AVTB,tpad=stop_mode=clone:stop_duration=${t},trim=duration=${t}`;
    if (c.textPath) {
      a.push('-i', c.textPath);
      const ti = n++;
      f.push(`${v}[b${i}]`);
      v = `[b${i}][${ti}:v]overlay=0:0`;
    }
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
    a.push('-i', o.path);
    f.push(`${vc}[${n++}:v]overlay=0:0:enable='between(t,${o.t0.toFixed(2)},${o.t1.toFixed(2)})'[vo${k}]`);
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
