// CueNote 원본 폴더에서 최신 배포 파일을 가져와 cuenote/downloads 를 채운다.
//   npm run sync:cuenote                 (기본 원본: D:/CueNote)
//   CUENOTE_DIR=E:/work/CueNote npm run sync:cuenote
// - 안드로이드 APK: package.json 버전의 release APK 를 CueNote-<버전>.apk 로 복사 (이전 버전 APK 는 지움)
// - AI 스킬: SKILL.md, claude.ai 업로드용 cuenote-md-skill.zip
// - 샘플 행사 MD 2개, 앱 아이콘
// - CueNote-resources.zip: 스킬 + 모든 MD 를 한 번에 받는 묶음
// - manifest.json: 버전·파일 크기 (소개 페이지가 읽어서 표시)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const SRC = resolve(process.env.CUENOTE_DIR ?? 'D:/CueNote');
const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'cuenote', 'downloads');
const IMG = join(ROOT, 'cuenote', 'images');

const must = p => { if (!existsSync(p)) throw new Error(`찾을 수 없어요: ${p}`); return p; };
const pkg = JSON.parse(readFileSync(must(join(SRC, 'package.json')), 'utf8'));
const version = pkg.version;
mkdirSync(OUT, { recursive: true });
mkdirSync(IMG, { recursive: true });

// 1) APK (이전 버전 정리)
const apkName = `CueNote-${version}.apk`;
for (const f of readdirSync(OUT)) if (/^CueNote-.*\.apk$/.test(f) && f !== apkName) rmSync(join(OUT, f));
copyFileSync(must(join(SRC, 'release', `CueNote-${version}-release.apk`)), join(OUT, apkName));

// 2) 스킬 · 샘플 · 아이콘
const skillMd = must(join(SRC, '.claude', 'skills', 'cuenote-md', 'SKILL.md'));
copyFileSync(skillMd, join(OUT, 'SKILL.md'));
const samples = [
  ['event_scenario.md', 'sample-ceremony.md', '샘플_창립30주년_기념식.md'],
  ['sample_cuesheet.md', 'sample-showcase.md', '샘플_신제품_쇼케이스.md'],
];
for (const [from, to] of samples) copyFileSync(must(join(SRC, 'src', 'samples', from)), join(OUT, to));
copyFileSync(must(join(SRC, 'public', 'icons', 'icon-512.png')), join(IMG, 'icon-512.png'));

// 3) zip (외부 도구 없이 직접 만든다. 한글 파일명은 UTF-8 플래그)
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const skill = readFileSync(skillMd);
// claude.ai 스킬 업로드용: 폴더 이름 = 스킬 이름
writeFileSync(join(OUT, 'cuenote-md-skill.zip'), makeZip([{ name: 'cuenote-md/SKILL.md', data: skill }]));

const guide = join(OUT, 'CueNote-guide.md');   // 사용 설명서는 이 저장소에서 직접 관리
const bundle = [
  { name: 'CueNote_사용설명서.md', data: readFileSync(must(guide)) },
  { name: 'AI스킬/SKILL.md', data: skill },
  { name: 'AI스킬/cuenote-md-skill.zip', data: readFileSync(join(OUT, 'cuenote-md-skill.zip')) },
  ...samples.map(([, to, nice]) => ({ name: `샘플MD/${nice}`, data: readFileSync(join(OUT, to)) })),
];
writeFileSync(join(OUT, 'CueNote-resources.zip'), makeZip(bundle));

// 4) manifest
const size = f => statSync(join(OUT, f)).size;
const manifest = {
  version,
  updatedAt: new Date().toISOString().slice(0, 10),
  minAndroid: '7.0',
  files: {
    apk: { file: apkName, size: size(apkName) },
    skillZip: { file: 'cuenote-md-skill.zip', size: size('cuenote-md-skill.zip') },
    skillMd: { file: 'SKILL.md', size: size('SKILL.md') },
    ceremony: { file: 'sample-ceremony.md', size: size('sample-ceremony.md') },
    showcase: { file: 'sample-showcase.md', size: size('sample-showcase.md') },
    guide: { file: 'CueNote-guide.md', size: size('CueNote-guide.md') },
    bundle: { file: 'CueNote-resources.zip', size: size('CueNote-resources.zip') },
  },
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`CueNote ${version} 동기화 완료 → ${OUT}`);
for (const [k, v] of Object.entries(manifest.files)) console.log(`  ${k.padEnd(9)} ${v.file}  ${(v.size / 1024).toFixed(1)} KB`);
