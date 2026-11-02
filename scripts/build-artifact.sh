#!/bin/bash
# Builds the single-file artifact: Parcel → inline → strip the document skeleton (the Artifact host adds it).
set -e
cd "$(dirname "$0")/.."
OUT="${1:-dist/pargar-tasks.html}"
rm -rf dist bundle.html
pnpm exec parcel build index.html --dist-dir dist --no-source-maps --log-level warn
pnpm exec html-inline dist/index.html > bundle.html
python3 - "$OUT" <<'PY'
import re, sys
s = open('bundle.html', encoding='utf-8').read()
styles = re.findall(r'<style[^>]*>.*?</style>', s, re.S)
i = s.index('<script type="module"')
j = s.rindex('</script>') + len('</script>')
script = s[i:j]
head = '''<title>تراز پرگار</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
'''
out = head + '\n'.join(styles) + '\n<div id="root"></div>\n' + script + '\n'
open(sys.argv[1], 'w', encoding='utf-8').write(out)
# full document for local Playwright tests
open('dist/preview.html', 'w', encoding='utf-8').write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + out.replace('<div id="root"></div>', '</head><body><div id="root"></div>', 1) + '</body></html>')
print(f'artifact: {len(out)//1024} KB')
PY
