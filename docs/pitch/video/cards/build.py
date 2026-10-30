"""Writes the five card projects (problem, solution, architecture, accuracy, outro), one folder each."""
import os, shutil, textwrap

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>Unicomply card: {title}</title>
<script src="gsap.min.js"></script>
<style>
  :root {{
    --bg: #f3f3f0; --surface: #ffffff; --text: #1b1f1d; --text2: #5b625e; --border: #cfd3d0;
    --accent: #0b5e6b; --accent-tint: rgba(11, 94, 107, 0.10); --red: #b3261e; --red-tint: rgba(179, 38, 30, 0.10);
    --amber: #8a5300;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; }}
  #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); }}
  .abs {{ position: absolute; }}
  .mono {{ font-family: monospace; letter-spacing: -0.01em; }}
  .eyebrow {{ font-size: 28px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); }}
  .card {{ background: var(--surface); border: 2px solid var(--border); border-radius: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }}
  .chip {{ display: inline-block; font-family: monospace; font-weight: 700; font-size: 28px; padding: 6px 16px; border: 2px solid var(--border);
          border-radius: 10px; background: #f6f7f5; color: var(--text); }}
  .caption {{ position: absolute; left: 96px; right: 96px; bottom: 96px; font-size: 62px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; opacity: 0; }}
  .brand {{ position: absolute; left: 96px; top: 64px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }}
  .brand span {{ color: var(--text2); font-weight: 500; font-size: 28px; margin-left: 12px; letter-spacing: 0.04em; }}
{css}
</style>
</head>
<body>
<div id="root" data-composition-id="{cid}" data-start="0" data-width="1920" data-height="1080" data-duration="{dur}">
<div class="brand">Unicomply<span>AICTE</span></div>
{body}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
const IN = {{ duration: 0.5, ease: "power3.out" }};
const OUT = {{ duration: 0.35, ease: "power2.in" }};
{js}
window.__timelines["{cid}"] = tl;
</script>
</body>
</html>
"""

def write(name, title, dur, css, body, js):
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
    os.makedirs(d, exist_ok=True)
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", "gsap.min.js"), d)
    with open(os.path.join(d, "index.html"), "w") as f:
        f.write(HEAD.format(title=title, cid=name, dur=dur, css=textwrap.dedent(css).replace('{{', '{').replace('}}', '}'), body=textwrap.dedent(body), js=textwrap.dedent(js)))

# ---------------------------------------------------------------- 2. problem (27 s)
write("problem", "the problem", 27, """
  #inst {{ left: 96px; top: 150px; }}
  #inst .name {{ font-size: 54px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; }}
  .lane {{ top: 330px; width: 520px; height: 330px; }}
  .lane .lh {{ position: absolute; left: 0; top: 0; }}
  .lane .line {{ position: absolute; left: 0; top: 56px; width: 520px; height: 3px; background: var(--border); }}
  .case {{ position: absolute; left: 0; top: 84px; width: 520px; padding: 22px 26px; opacity: 0; }}
  .case .ref {{ font-family: monospace; font-weight: 700; font-size: 28px; color: var(--accent); }}
  .case .txt {{ font-size: 30px; line-height: 1.25; margin-top: 8px; }}
  .q {{ position: absolute; top: 470px; width: 64px; height: 64px; border-radius: 50%; border: 3px dashed var(--red); color: var(--red);
        font-size: 38px; font-weight: 700; display: grid; place-items: center; background: var(--bg); opacity: 0; }}
  #mail {{ left: 330px; top: 700px; width: 1260px; padding: 20px 30px; opacity: 0; display: flex; align-items: center; gap: 26px; }}
  #mail .tag {{ font-size: 28px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); white-space: nowrap; }}
  #mail .typo {{ font-family: monospace; font-size: 38px; font-weight: 700; text-decoration: underline wavy var(--red); text-underline-offset: 8px; }}
  #sla {{ left: 96px; top: 700px; width: 1728px; opacity: 0; }}
  #sla .row {{ display: flex; justify-content: space-between; align-items: baseline; }}
  #sla .ref {{ font-family: monospace; font-weight: 700; font-size: 28px; color: var(--accent); }}
  #sla .day {{ position: relative; width: 520px; height: 44px; }}
  #sla .day span {{ position: absolute; right: 0; top: 0; font-size: 36px; font-weight: 700; }}
  #sla .track {{ position: relative; height: 26px; margin-top: 14px; border-radius: 13px; background: #e4e6e3; overflow: hidden; }}
  #sla .fill {{ position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--accent); border-radius: 13px; }}
  #sla .notch {{ position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.7); }}
  #sla .lim {{ position: absolute; top: 12px; width: 4px; height: 56px; background: var(--text); }}
  #sla .limlbl {{ position: absolute; top: 74px; font-size: 28px; font-weight: 600; color: var(--text2); transform: translateX(-50%); white-space: nowrap; }}
""", """
<div id="inst" class="abs"><div class="eyebrow">Complaints about</div><div class="name">Maharaja Agrasen Institute of Technology, Delhi</div></div>

<div class="abs lane" id="lane1" style="left:96px"><div class="lh chip">PGRC</div><div class="line"></div>
  <div class="case card" id="c1"><div class="ref">PGRC/2026/00412</div><div class="txt">Fee refund refused after withdrawal; original certificates withheld</div></div></div>
<div class="abs lane" id="lane2" style="left:700px"><div class="lh chip">RB</div><div class="line"></div>
  <div class="case card" id="c2"><div class="ref">RB/2026/00087</div><div class="txt">Faculty shortage found during inspection; show-cause notice issued</div></div></div>
<div class="abs lane" id="lane3" style="left:1304px"><div class="lh chip">RO-NWRO</div><div class="line"></div>
  <div class="case card" id="c3"><div class="ref">RO-NWRO/2026/00133</div><div class="txt">Original certificates of 4 students withheld</div></div></div>

<div class="q" id="q1" style="left:616px">?</div>
<div class="q" id="q2" style="left:1220px">?</div>

<div class="abs card" id="mail"><div class="tag">New email</div><div class="typo">maharaja agrsen instt of tech delhi</div></div>

<div class="abs" id="sla">
  <div class="row"><div><div class="eyebrow">Service-level clock</div><div class="ref">PGRC/2026/00412</div></div>
    <div class="day"><span id="d19">Day 19 of 21</span><span id="d22" style="opacity:0;color:var(--red)">Day 22: beyond SLA</span></div></div>
  <div class="track"><div class="fill" id="fill"></div></div>
  <div style="position:relative;height:100px"><div class="lim" id="lim" style="left:1560px"></div><div class="limlbl" id="limlbl" style="left:1562px">21-day limit</div></div>
</div>

<div class="caption" id="k1">One college. Four complaints.</div>
<div class="caption" id="k2">Three bureaus. Each sees only one.</div>
<div class="caption" id="k3">A fourth arrives, misspelt.</div>
<div class="caption" id="k4">No bureau can see the others.</div>
<div class="caption" id="k5">The 21-day limit passes unnoticed.</div>
""", """
const show = (id, at, hold) => {
  tl.fromTo(id, { opacity: 0, y: 24 }, { opacity: 1, y: 0, ...IN }, at);
  if (hold) tl.to(id, { opacity: 0, ...OUT }, hold);
};
tl.fromTo("#inst", { opacity: 0, y: 16 }, { opacity: 1, y: 0, ...IN }, 0.2);
show("#k1", 0.4, 4.2);
tl.fromTo(".lane", { opacity: 0 }, { opacity: 1, ...IN }, 3.2);
show("#c1", 4.6); show("#c2", 7.2); show("#c3", 9.8);
show("#k2", 4.6, 12.0);
show("#mail", 12.4, 19.0);
show("#k3", 12.6, 18.6);
tl.fromTo("#q1", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 18.9);
tl.fromTo("#q2", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 19.2);
tl.to([".case"], { opacity: 0.5, duration: 0.6, ease: "power2.out" }, 19.4);
show("#k4", 18.9, 22.6);
tl.fromTo("#sla", { opacity: 0, y: 24 }, { opacity: 1, y: 0, ...IN }, 19.6);
tl.to("#fill", { width: "82%", duration: 2.6, ease: "power1.inOut" }, 20.2);
tl.to("#fill", { width: "100%", backgroundColor: "#b3261e", duration: 1.2, ease: "power1.inOut" }, 23.2);
tl.to("#d19", { opacity: 0, ...OUT }, 23.2);
tl.fromTo("#d22", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power3.out" }, 23.6);
show("#k5", 22.9);
tl.to("#mail", { y: -14, duration: 5.4, ease: "none" }, 13.2);
tl.to(".case", { y: -8, duration: 5.0, ease: "none" }, 13.6);
""")

# ---------------------------------------------------------------- 3. solution (15 s)
write("solution", "the solution", 15, """
  #line {{ left: 96px; top: 190px; right: 96px; font-size: 92px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; max-width: 1500px; }}
  #sub {{ left: 96px; top: 470px; font-size: 34px; color: var(--text2); }}
  .pil {{ top: 520px; width: 548px; height: 420px; padding: 36px 38px; opacity: 0; }}
  .pil .n {{ font-family: monospace; font-weight: 700; font-size: 28px; color: var(--accent); }}
  .pil h3 {{ margin: 14px 0 14px; font-size: 52px; letter-spacing: -0.02em; line-height: 1.05; }}
  .pil p {{ margin: 0; font-size: 33px; line-height: 1.3; color: var(--text2); }}
  .pil .bar {{ position: absolute; left: 38px; bottom: 36px; width: 70px; height: 6px; border-radius: 3px; background: var(--accent); }}
""", """
<div class="abs" id="line">One view of every complaint about an institution.</div>
<div class="abs eyebrow" id="sub">Smart India Hackathon 2026 · PS 26264</div>
<div class="abs card pil" id="p1" style="left:96px"><div class="n">01</div><h3>One registry</h3><p>3,751 real AICTE institutions, one Permanent ID each.</p><div class="bar"></div></div>
<div class="abs card pil" id="p2" style="left:686px"><div class="n">02</div><h3>Overlap engine</h3><p>Finds open cases about the same institution across bureaus, with reasons in plain words.</p><div class="bar"></div></div>
<div class="abs card pil" id="p3" style="left:1276px"><div class="n">03</div><h3>Role-based workflow</h3><p>Every action logged. A person confirms each overlap.</p><div class="bar"></div></div>
""", """
tl.fromTo("#line", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.3);
tl.fromTo("#sub", { opacity: 0 }, { opacity: 1, ...IN }, 1.2);
tl.to(["#line", "#sub"], { y: -70, duration: 0.7, ease: "power2.inOut" }, 4.3);
["#p1", "#p2", "#p3"].forEach((id, i) => tl.fromTo(id, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 4.9 + i * 1.7));
tl.fromTo(".pil .bar", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 1.6, ease: "power2.out", stagger: 1.7 }, 5.6);
tl.to(".pil", { y: -10, duration: 5.6, ease: "none" }, 9.0);
""")

# ---------------------------------------------------------------- 5. architecture (20 s)
write("architecture", "technical approach", 20, """
  .hdr {{ top: 150px; font-size: 28px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text2); }}
  .row {{ left: 96px; width: 1728px; height: 164px; opacity: 0; }}
  .row .lay {{ position: absolute; left: 36px; top: 0; bottom: 0; width: 300px; display: flex; align-items: center; font-size: 42px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }}
  .row .lay i {{ flex: none; display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); margin-right: 20px; }}
  .row .does {{ position: absolute; left: 360px; top: 0; bottom: 0; width: 460px; display: flex; align-items: center; font-size: 30px; line-height: 1.25; color: var(--text2); }}
  .row .stack {{ position: absolute; left: 860px; top: 0; bottom: 0; right: 0; display: flex; flex-wrap: wrap; align-content: center; align-items: center; gap: 12px; border-left: 3px solid var(--border); padding: 0 30px 0 34px; }}
  .row .stack .chip {{ opacity: 0; font-size: 28px; }}
  .flow {{ left: 138px; width: 4px; background: var(--accent); opacity: 0.35; height: 0; }}
  #note {{ left: 96px; right: 96px; bottom: 56px; font-size: 44px; font-weight: 650; letter-spacing: -0.02em; opacity: 0; }}
""", """
<div class="abs hdr" style="left:132px" id="h1">Layer</div>
<div class="abs hdr" style="left:456px" id="h2">What it does</div>
<div class="abs hdr" style="left:990px" id="h3">Tech stack</div>
<div class="abs flow" id="flow" style="top:260px"></div>
<div class="abs card row" id="r1" style="top:210px"><div class="lay"><i></i>Frontend</div><div class="does">Role-based screens: Today, Cases, Intake, Overlaps, Institutions, Reports</div>
  <div class="stack"><span class="chip">React 19</span><span class="chip">TypeScript</span><span class="chip">Ant Design 6</span><span class="chip">TanStack Query</span><span class="chip">react-router 7</span></div></div>
<div class="abs card row" id="r2" style="top:394px"><div class="lay"><i></i>Backend</div><div class="does">Scoped REST API, case workflow, alerts and audit trail</div>
  <div class="stack"><span class="chip">FastAPI</span><span class="chip">SQLModel</span><span class="chip">SQLite</span></div></div>
<div class="abs card row" id="r3" style="top:578px"><div class="lay"><i></i>Matching engine</div><div class="does">Resolves misspelt names, links open cases across bureaus</div>
  <div class="stack"><span class="chip">sentence-transformers</span><span class="chip">TF-IDF fallback</span><span class="chip">rapidfuzz</span><span class="chip">scikit-learn</span></div></div>
<div class="abs card row" id="r4" style="top:762px"><div class="lay"><i></i>Data</div><div class="does">Real registry, synthetic cases with known answers</div>
  <div class="stack"><span class="chip">AICTE registry</span><span class="chip">3,751 institutions</span></div></div>
<div class="abs" id="note">Runs fully offline.</div>
""", """
tl.fromTo([".hdr"], { opacity: 0 }, { opacity: 1, ...IN }, 0.3);
tl.to("#flow", { height: 640, duration: 6.0, ease: "none" }, 1.0);
["#r1", "#r2", "#r3", "#r4"].forEach((id, i) => {
  const at = 1.0 + i * 2.2;
  tl.fromTo(id, { opacity: 0, y: 30 }, { opacity: 1, y: 0, ...IN }, at);
  tl.fromTo(id + " .chip", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.18 }, at + 0.6);
});
tl.fromTo("#note", { opacity: 0, y: 20 }, { opacity: 1, y: 0, ...IN }, 11.6);
tl.to(".row", { y: -8, duration: 7.0, ease: "none" }, 12.4);
""")

# ---------------------------------------------------------------- 6. accuracy (10 s)
write("accuracy", "feasibility and accuracy", 10, """
  #h {{ left: 96px; top: 150px; font-size: 64px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.08; max-width: 1500px; }}
  .m {{ top: 400px; width: 548px; height: 360px; padding: 34px 38px; opacity: 0; }}
  .m .l {{ font-size: 28px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); }}
  .m .v {{ font-family: monospace; font-size: 150px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; margin-top: 30px; color: var(--accent); }}
  .m .c {{ font-family: monospace; font-size: 30px; color: var(--text2); margin-top: 20px; }}
  #foot {{ left: 96px; right: 96px; bottom: 90px; font-size: 40px; font-weight: 650; letter-spacing: -0.02em; opacity: 0; }}
  #foot span {{ color: var(--text2); font-weight: 500; }}
""", """
<div class="abs" id="h">Institution name resolution, measured on cases the engine never saw while tuning</div>
<div class="abs card m" id="m1" style="left:96px"><div class="l">Precision</div><div class="v" id="v1">0.000</div><div class="c">655 of 656 links correct</div></div>
<div class="abs card m" id="m2" style="left:686px"><div class="l">Recall</div><div class="v" id="v2">0.000</div><div class="c">655 of 769 cases linked</div></div>
<div class="abs card m" id="m3" style="left:1276px"><div class="l">F1</div><div class="v" id="v3">0.000</div><div class="c">balance of the two</div></div>
<div class="abs" id="foot">Test split · 769 synthetic cases with planted answers · <span>runs fully offline</span></div>
""", """
tl.fromTo("#h", { opacity: 0, y: 20 }, { opacity: 1, y: 0, ...IN }, 0.2);
const targets = [["#v1", 0.998], ["#v2", 0.852], ["#v3", 0.919]];
targets.forEach(([id, val], i) => {
  const card = "#m" + (i + 1), at = 1.4 + i * 0.5, o = { v: 0 };
  tl.fromTo(card, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, at);
  tl.to(o, { v: val, duration: 1.4, ease: "power2.out", onUpdate: () => { document.querySelector(id).textContent = o.v.toFixed(3); } }, at + 0.1);
});
tl.fromTo("#foot", { opacity: 0, y: 16 }, { opacity: 1, y: 0, ...IN }, 4.2);
""")

# ---------------------------------------------------------------- 7. outro (10 s)
write("outro", "impact and next steps", 10, """
  #big {{ left: 96px; top: 190px; right: 96px; font-size: 100px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; max-width: 1560px; }}
  #nx {{ left: 96px; top: 560px; }}
  #nx .chips {{ display: flex; gap: 16px; margin-top: 18px; flex-wrap: wrap; }}
  #nx .chips .chip {{ font-family: system-ui, sans-serif; font-weight: 600; font-size: 32px; padding: 12px 24px; }}
  #team {{ left: 96px; top: 800px; }}
  #team .names {{ font-size: 34px; font-weight: 650; margin-top: 8px; line-height: 1.35; }}
  #repo {{ right: 96px; top: 800px; text-align: right; }}
  #repo .u {{ font-family: monospace; font-size: 34px; font-weight: 700; margin-top: 8px; color: var(--accent); }}
""", """
<div class="abs" id="big">One source of truth for every institution.</div>
<div class="abs" id="nx"><div class="eyebrow">Next</div><div class="chips"><span class="chip">CPGRAMS integration</span><span class="chip">Parichay sign-in</span><span class="chip">Postgres + pgvector at national scale</span></div></div>
<div class="abs" id="team"><div class="eyebrow">Team</div><div class="names">Krishna Sharma · Shreyas Singh<br>Priyanshi Gupta · Suryansh Singh</div></div>
<div class="abs" id="repo"><div class="eyebrow">Smart India Hackathon 2026 · PS 26264</div><div class="u">github.com/krishnasharma1493/Unicomply</div></div>
""", """
tl.fromTo("#big", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.3);
tl.fromTo("#nx", { opacity: 0, y: 24 }, { opacity: 1, y: 0, ...IN }, 3.4);
tl.fromTo("#nx .chip", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.3 }, 3.7);
tl.fromTo(["#team", "#repo"], { opacity: 0, y: 24 }, { opacity: 1, y: 0, ...IN }, 6.2);
""")
print("written")
