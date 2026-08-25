"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const projectRoot = path.resolve(__dirname, "..");
const manifest = readJson("manifest.json");
const packageMetadata = readJson("package.json");

if (manifest.version !== packageMetadata.version) {
  throw new Error(
    `Version mismatch: manifest.json is ${manifest.version}, ` +
      `package.json is ${packageMetadata.version}`
  );
}

if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
  throw new Error(`Invalid extension version: ${manifest.version}`);
}

const releaseFiles = [
  "manifest.json",
  "_locales/en/messages.json",
  "_locales/ru/messages.json",
  "analysis-client.js",
  "background.js",
  "dictionaries.js",
  "dynamic-correction.js",
  "field-safety.js",
  "i18n.js",
  "layout-map.js",
  "options.css",
  "options.html",
  "options.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "replace-selection.js",
  "settings.js",
  "theme.js",
  "word-analyzer.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "icons/moon.svg",
  "icons/sun.svg",
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md"
];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const outputDirectory = path.join(projectRoot, "dist");
const archiveName = `qswapp-v${manifest.version}.zip`;
const archivePath = path.join(outputDirectory, archiveName);
const checksumPath = `${archivePath}.sha256`;
const archive = createZip(releaseFiles);
const checksum = crypto.createHash("sha256").update(archive).digest("hex");

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(archivePath, archive);
fs.writeFileSync(checksumPath, `${checksum}  ${archiveName}\n`, "utf8");

console.log(`Created ${path.relative(projectRoot, archivePath)}`);
console.log(`Files: ${releaseFiles.length}`);
console.log(`Size: ${archive.length} bytes`);
console.log(`SHA-256: ${checksum}`);

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, fileName), "utf8"));
}

function createZip(fileNames) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const fileName of fileNames) {
    const normalizedName = fileName.replaceAll("\\", "/");
    const absolutePath = path.join(projectRoot, fileName);
    const stats = fs.statSync(absolutePath);

    if (!stats.isFile()) {
      throw new Error(`Release entry is not a file: ${fileName}`);
    }

    const source = fs.readFileSync(absolutePath);
    const compressed = zlib.deflateRawSync(source, { level: 9 });
    const useCompression = compressed.length < source.length;
    const contents = useCompression ? compressed : source;
    const compressionMethod = useCompression ? 8 : 0;
    const fileNameBuffer = Buffer.from(normalizedName, "utf8");
    const checksum = crc32(source);
    const { dosDate, dosTime } = toDosDateTime(stats.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contents.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuffer, contents);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contents.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileNameBuffer);
    localOffset += localHeader.length + fileNameBuffer.length + contents.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(fileNames.length, 8);
  endRecord.writeUInt16LE(fileNames.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function toDosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);

  return { dosDate, dosTime };
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
