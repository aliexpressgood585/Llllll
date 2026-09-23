"""Inline office/dist (one JS, one CSS) into a single Artifact page: office/agent-office.html."""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
dist = root / 'dist'
html = (dist / 'index.html').read_text()
css = ''.join(p.read_text() for p in (dist / 'assets').glob('*.css'))
js = ''.join(p.read_text() for p in (dist / 'assets').glob('*.js'))
js = js.replace('</script', '<\\/script')
page = f"""<title>משרד הסוכנים</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap">
<script>document.documentElement.lang='he';document.documentElement.dir='rtl';</script>
<style>{css}</style>
<div id="root"></div>
<script type="module">{js}</script>
"""
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'agent-office.html'
out.write_text(page)
print(f'wrote {out} ({len(page) / 1024:.0f} KB)')
