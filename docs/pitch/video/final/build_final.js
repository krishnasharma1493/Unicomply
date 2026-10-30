const { execFileSync } = require('child_process');
const plan = require('./plan');
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const parts = [
  ['Cold open', '../brag/brag.mp4'], ['The problem', '../cards/out/problem.mp4'], ['The solution', '../cards/out/solution.mp4'],
  ...plan.map((c) => [`Demo ${c.n}: ${c.title}`, `clips/${c.id}.mp4`]),
  ['Technical approach', '../cards/out/architecture.mp4'], ['Accuracy', '../cards/out/accuracy.mp4'], ['Impact and next steps', '../cards/out/outro.mp4'],
];
let t = 0; const starts = [];
for (const [name, f] of parts) { starts.push([name, t]); t += dur(f); }
const total = t;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
require('fs').writeFileSync('chapters.txt', starts.map(([n, s]) => `${fmt(s)} ${n}`).join('\n') + `\n(total ${total.toFixed(2)}s)\n`);
const args = ['-v', 'error', '-y'];
parts.forEach(([, f]) => args.push('-i', f));
args.push('-i', '../brag/composition/assets/music/bed.mp3');
const n = parts.length; const f = [];
parts.forEach((_, i) => f.push(`[${i}:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,setsar=1[v${i}]`));
f.push(`${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[v]`);
f.push(`[${n}:a]atrim=0:164,asetpts=PTS-STARTPTS[a1]`, `[${n}:a]atrim=40:110,asetpts=PTS-STARTPTS[a2]`, `[a1][a2]acrossfade=d=3,volume=0.3,atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 2).toFixed(3)}:d=2[a]`);
args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '../unicomply-demo.mp4');
console.log('expected total', total.toFixed(2));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
