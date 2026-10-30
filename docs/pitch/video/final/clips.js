// One ffmpeg run per chapter: 1 s card, then the trimmed / speed-ramped / zoomed recording with its caption pills.
const plan = require('./plan');
const { execFileSync } = require('child_process');
require('fs').mkdirSync('clips', { recursive: true });
const only = process.argv.slice(2);
for (const ch of plan) {
  if (only.length && !only.includes(ch.id)) continue;
  const inputs = ['-i', `../recordings/${ch.file}.webm`, '-loop', '1', '-framerate', '30', '-t', '1', '-i', `png/card_${ch.id}.png`];
  const f = [];
  const K = ch.segs.length;
  f.push(`[0:v]split=${K}${ch.segs.map((_, i) => `[r${i}]`).join('')}`);
  ch.segs.forEach(([s, e, spd, z], i) => {
    const D = ((e - s) / spd).toFixed(3);
    let chain = `[r${i}]trim=start=${s}:end=${e},setpts=(PTS-STARTPTS)/${spd},fps=30,scale=1920:1080:flags=lanczos`;
    if (z) chain += `,scale=w='trunc(1920*(1+${z.z}*min(t/${D},1))/2)*2':h='trunc(1080*(1+${z.z}*min(t/${D},1))/2)*2':eval=frame,crop=1920:1080:x='(iw-1920)*${z.fx}':y='(ih-1080)*${z.fy}'`;
    f.push(`${chain},format=yuv420p,setsar=1[s${i}]`);
  });
  f.push(`[1:v]format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=0.75:d=0.25,setsar=1[card]`);
  f.push(`[card]${ch.segs.map((_, i) => `[s${i}]`).join('')}concat=n=${K + 1}:v=1:a=0[base0]`);
  let last = 'base0';
  ch.caps.forEach(([, st, d], i) => {
    const idx = 2 + i;
    inputs.push('-loop', '1', '-framerate', '30', '-t', String(d + 0.1), '-i', `png/cap_${ch.id}${i}.png`);
    f.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3:alpha=1,setpts=PTS-STARTPTS+${(st + 1).toFixed(2)}/TB[c${i}]`);
    f.push(`[${last}][c${i}]overlay=0:0:eof_action=pass:format=auto[o${i}]`);
    last = `o${i}`;
  });
  const out = `clips/${ch.id}.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', f.join(';'), '-map', `[${last}]`, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(ch.id, 'built', dur + 's');
}
