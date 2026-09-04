#!/usr/bin/env node
/* KHub encoding guard (static)
   Usage: node scripts/check-encoding.mjs <path-to-app-dir-or-file>

   Catches the "scribbling" class of bug: source that was UTF-8 but got
   decoded as Latin-1/Windows-1252 and re-saved (double-encoded UTF-8, aka
   mojibake). That corruption turns emoji, box-drawing dividers, dashes,
   and Spanish accents into garbage: one code point becomes a multi-character
   run whose bytes include C1 control code points (U+0080-U+009F).
   (This file deliberately contains no literal mojibake, so it passes its
   own check; the tests build corrupted samples from escape sequences.)

   Zero dependencies â€” runs on plain `node`, so it works in app repos that
   have no package.json. Exit 1 if any file is corrupted, 0 if clean. */

import fs from 'fs';
import path from 'path';

// Text formats we read as UTF-8. Binary (png/svg/ico/woff...) is skipped.
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.json',
  '.md', '.txt', '.webmanifest', '.yml', '.yaml', '.toml', '.svg',
]);

// Directories that never contain hand-authored source.
const SKIP_DIR = new Set(['.git', 'node_modules', 'icons']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* The reliable, false-positive-free signals of double-encoded UTF-8:
   - C1 control code points U+0080-U+009F appearing as characters. Genuine
     text never contains these; they only show up as the trailing bytes of
     a UTF-8 sequence that was reinterpreted as Latin-1.
   - U+FFFD REPLACEMENT CHARACTER, left behind by a lossy decode.
   Legit emoji and accented letters are single code points > U+00FF, so they
   are never flagged. */
export function scanText(text) {
  const issues = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const cp = line.codePointAt(j);
      const isC1 = cp >= 0x80 && cp <= 0x9f;
      const isRepl = cp === 0xfffd;
      if (isC1 || isRepl) {
        const start = Math.max(0, j - 12);
        issues.push({
          line: i + 1,
          col: j + 1,
          codePoint:(JÉØÜÔİš[™ÊMŠKÕ\\Ø\ÙJ
KœYİ\
	Ì	Ê_XˆÚ[™ˆ\Ô™\È	Ü™\XÙ[Y[XÚ\‰Èˆ	Û[ÚšX˜ZÙKXÌIËˆÛÛ^ˆ”ÓÓ‹œİš[™ÚYJ[™KœÛXÙJİ\ˆ
ÈLŠJKˆJNÂˆBˆBˆBˆ™]\›ˆ\ÜİY\ÎÂŸB‚™^Ü[˜İ[Ûˆš[™[˜ÛÙ[™Ò\ÜİY\Êš[\ÊHÂˆÛÛœİ™\ÜH×NÂˆ›Üˆ
ÛÛœİˆÙˆš[\ÊHÂˆYˆ
UVÑVš\Ê]™^˜[YJŠKÓİÙ\Ø\ÙJ
JJHÛÛ[YNÂˆ]^ÂˆHÂˆ^HœËœ™XYš[TŞ[˜Ê‹	İ]	ÊNÂˆHØ]ÚÂˆÛÛ[YNÂˆBˆÛÛœİ\ÜİY\ÈHØØ[•^
^
NÂˆYˆ
\ÜİY\Ë›[™İ
H™\Üœ\Ú
Èš[Nˆ‹\ÜİY\ÈJNÂˆBˆ™]\›ˆ™\ÜÂŸB‚‹ËÈKKHÓHKKB‹ËÈ[\Ü›Y]K\›X]Ú\È\™İ–ÌWHÛ›HÚ[ˆ\Èš[H\È[ˆ\™XİK‚˜ÛÛœİ[›ÚÙY\™XİHBˆ›ØÙ\ÜË˜\™İ–ÌWH	‰‚ˆ]œ™\ÛÛ™J›ØÙ\ÜË˜\™İ–ÌWJHOOH]œ™\ÛÛ™J™]ÈT“
[\Ü›Y]K\›
Kœ]˜[YJNÂ‚šYˆ
[›ÚÙY\™XİJHÂˆÛÛœİ\™Ù]H›ØÙ\ÜË˜\™İ–Ì—H	Ë‰ÎÂˆÛÛœİİ]HœËœİ]Ş[˜Ê\™Ù]
NÂˆÛÛœİš[\ÈHİ]š\Ñ\™XİÜJ
HÈØ[Ê\™Ù]
Hˆİ\™Ù]NÂˆÛÛœİ™\ÜHš[™[˜ÛÙ[™Ò\ÜİY\Êš[\ÊNÂ‚ˆYˆ
™\Ü›[™İOOH
HÂˆÛÛœÛÛK›ÙÊ[˜ÛÙ[™ÈÚXÚÎˆÛX[ˆ
	Ùš[\Ë›[™İHš[\ÈØØ[›™Y›È[ÚšX˜ZÙJX
NÂˆ›ØÙ\ÜË™^]

NÂˆB‚ˆ]İ[HÂˆ›Üˆ
ÛÛœİÈš[K\ÜİY\ÈHÙˆ™\Ü
HÂˆÛÛœÛÛK™\œ›ÜŠ‘RS
G¶f–ÆWÒÒG¶—77VW2æÆVæwF‡Ò½ÉÉÕÁÑ•¡…É…Ñ•È¡Ì¤é€¤ì(€€€™½È€¡½¹ÍĞ¥Ğ½˜©ssues.slice(0, 8)) {
      console.error(`  line ${it.line}:${it.col}  ${it.codePoint} (${it.kind})  near ${it.context}`);
    }
    if (issues.length > 8) console.error(`  ... and ${issues.length - 8} more`);
    total += issues.length;
  }
  console.error(
    `\nencoding check FAILED: ${total} corrupted character(s) in ${report.length} file(s).`
  );
  console.error(
    'Cause: double-encoded UTF-8 (file decoded as Latin-1([™™K\Ø]™Y
Kˆ	È
Âˆ	Ñš^ˆ™KYXÛÙHHÛÜœ\Y]K\[œÈ
][‹LHOˆ]‹N
K[ˆ™K\Ø]™H\ÈU‹N‰Âˆ
NÂˆ›ØÙ\ÜË™^]
JNÂŸB