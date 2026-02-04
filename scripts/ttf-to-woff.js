import fs from 'fs';
import zlib from 'zlib';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/ttf-to-woff.js <input.ttf> <output.woff>');
  process.exit(1);
}

const buffer = fs.readFileSync(inputPath);
const flavor = buffer.readUInt32BE(0);
const numTables = buffer.readUInt16BE(4);

const tableRecords = [];
let offset = 12;
for (let i = 0; i < numTables; i += 1) {
  const tag = buffer.toString('ascii', offset, offset + 4);
  const checksum = buffer.readUInt32BE(offset + 4);
  const tableOffset = buffer.readUInt32BE(offset + 8);
  const length = buffer.readUInt32BE(offset + 12);
  tableRecords.push({ tag, checksum, tableOffset, length });
  offset += 16;
}

const align4 = (value) => (value + 3) & ~3;

let totalSfntSize = 12 + 16 * numTables;
for (const record of tableRecords) {
  totalSfntSize += align4(record.length);
}

const tables = tableRecords.map((record) => {
  const tableData = buffer.slice(record.tableOffset, record.tableOffset + record.length);
  const compressed = zlib.deflateSync(tableData);
  const useCompressed = compressed.length < tableData.length;
  return {
    tag: record.tag,
    checksum: record.checksum,
    origLength: tableData.length,
    compLength: useCompressed ? compressed.length : tableData.length,
    data: useCompressed ? compressed : tableData
  };
});

let woffOffset = 44 + tables.length * 20;
const tableDirs = [];
for (const table of tables) {
  const entryOffset = align4(woffOffset);
  tableDirs.push({
    tag: table.tag,
    offset: entryOffset,
    compLength: table.compLength,
    origLength: table.origLength,
    checksum: table.checksum
  });
  woffOffset = entryOffset + table.compLength;
}

const totalWoffSize = align4(woffOffset);
const output = Buffer.alloc(totalWoffSize);

output.write('wOFF', 0, 4, 'ascii');
output.writeUInt32BE(flavor, 4);
output.writeUInt32BE(totalWoffSize, 8);
output.writeUInt16BE(numTables, 12);
output.writeUInt16BE(0, 14);
output.writeUInt32BE(totalSfntSize, 16);
output.writeUInt16BE(buffer.readUInt16BE(4 + 2), 20);
output.writeUInt16BE(buffer.readUInt16BE(4 + 4), 22);
output.writeUInt32BE(0, 24);
output.writeUInt32BE(0, 28);
output.writeUInt32BE(0, 32);
output.writeUInt32BE(0, 36);
output.writeUInt32BE(0, 40);

let dirOffset = 44;
for (const dir of tableDirs) {
  output.write(dir.tag, dirOffset, 4, 'ascii');
  output.writeUInt32BE(dir.offset, dirOffset + 4);
  output.writeUInt32BE(dir.compLength, dirOffset + 8);
  output.writeUInt32BE(dir.origLength, dirOffset + 12);
  output.writeUInt32BE(dir.checksum, dirOffset + 16);
  dirOffset += 20;
}

for (let i = 0; i < tables.length; i += 1) {
  const table = tables[i];
  const dir = tableDirs[i];
  table.data.copy(output, dir.offset);
}

fs.writeFileSync(outputPath, output);
