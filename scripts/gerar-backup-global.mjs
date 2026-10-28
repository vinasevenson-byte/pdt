#!/usr/bin/env node
/**
 * Gerador de Backup Global UTF-8 (Bit 11 ativo) e Bundle Git
 * - Evita a codificação #U2013 / #U2014 do git archive em sistemas Linux/macOS
 * - Preserva bytes exatos dos blobs do Git (LF em código, binário exato no HTML original)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Cria um arquivo ZIP padrão PKZIP 2.0 com General Purpose Bit 11 (0x0800 = UTF-8) em todas as entradas.
 */
export function criarZipUtf8DeGitHead(rootDir = ROOT_DIR, outputZipPath) {
  const rawList = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-tree', '-r', '-z', 'HEAD'], {
    cwd: rootDir,
    maxBuffer: 32 * 1024 * 1024
  });

  const entries = rawList
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(line => {
      const tabIdx = line.indexOf('\t');
      const meta = line.slice(0, tabIdx).trim().split(/\s+/);
      const filePath = line.slice(tabIdx + 1);
      return {
        mode: meta[0],
        sha: meta[2],
        filePath
      };
    });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = fs.readFileSync(path.join(rootDir, entry.filePath));
    const nameBuf = Buffer.from(entry.filePath.replace(/\\/g, '/'), 'utf8');
    const uncompressedSize = data.length;
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < uncompressedSize;
    const payload = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const flags = 0x0800; // Bit 11: filename and comment are UTF-8 encoded

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5d5b, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, payload);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5d5b, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
  }

  const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(outputZipPath), { recursive: true });
  fs.writeFileSync(outputZipPath, Buffer.concat([...localParts, ...centralParts, eocd]));
  return { totalArquivos: entries.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const versionArg = process.argv[2] || 'v3.0.0';
  const backupsDir = path.join(ROOT_DIR, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const zipName = `Hub_Repasses_Backup_Global_${versionArg}.zip`;
  const zipPath = path.join(backupsDir, zipName);
  const bundlePath = path.join(backupsDir, 'Hub_Repasses_Git_Completo.bundle');
  const bundleVerPath = path.join(backupsDir, `Hub_Repasses_Git_Completo_${versionArg}.bundle`);

  const { totalArquivos } = criarZipUtf8DeGitHead(ROOT_DIR, zipPath);
  execFileSync('git', ['bundle', 'create', bundlePath, '--all'], { cwd: ROOT_DIR });
  fs.copyFileSync(bundlePath, bundleVerPath);

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT_DIR }).toString('utf8').trim();
  const sha256File = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  const manifest = {
    commit,
    branch: 'main',
    tagRemota: `backup-global-${versionArg}`,
    geradoEm: new Date().toISOString(),
    totalArquivosNoZip: totalArquivos,
    arquivos: [
      {
        nome: zipName,
        bytes: fs.statSync(zipPath).size,
        sha256: sha256File(zipPath)
      },
      {
        nome: path.basename(bundlePath),
        bytes: fs.statSync(bundlePath).size,
        sha256: sha256File(bundlePath)
      },
      {
        nome: path.basename(bundleVerPath),
        bytes: fs.statSync(bundleVerPath).size,
        sha256: sha256File(bundleVerPath)
      }
    ]
  };

  fs.writeFileSync(path.join(backupsDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`✅ Backup Global ${versionArg} gerado (${totalArquivos} arquivos, UTF-8 Bit 11 ativo).`);
}
