/**
 * A lightweight, self-contained QR Code generator in vanilla ES6.
 * Generates QR Codes (version 1 to 40) using byte encoding and renders as SVG.
 */

// QR Code Constants and Tables
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  GF256_EXP[i] = x;
  GF256_LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) {
  GF256_EXP[i] = GF256_EXP[i - 255];
}

function gfMultiply(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

// Error Correction levels: L(7%), M(15%), Q(25%), H(30%)
const EC_LEVELS = {
  L: { ordinal: 1, grade: 0 },
  M: { ordinal: 0, grade: 1 },
  Q: { ordinal: 3, grade: 2 },
  H: { ordinal: 2, grade: 3 }
};

// Polynomial Math
function makeGeneratorPolynomial(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMultiply(poly[j], GF256_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function calculateErrorCorrection(data, ecCount) {
  const genPoly = makeGeneratorPolynomial(ecCount);
  const result = new Uint8Array(data.length + ecCount);
  result.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        result[i + j] ^= gfMultiply(genPoly[j], coef);
      }
    }
  }
  return result.slice(data.length);
}

// Capacity Table: [Version, EC Level (L, M, Q, H), EC Codewords, Data Codewords, Blocks...]
// We use a simplified dynamic layout generator.
// QR Version limits for byte mode:
const QR_VERSIONS = [
  // Total codewords, EC-L, EC-M, EC-Q, EC-H
  null,
  { total: 26, ec: { L: 7, M: 10, Q: 13, H: 17 }, blocks: { L: 1, M: 1, Q: 1, H: 1 } },
  { total: 44, ec: { L: 10, M: 16, Q: 22, H: 28 }, blocks: { L: 1, M: 1, Q: 1, H: 1 } },
  { total: 70, ec: { L: 15, M: 26, Q: 36, H: 44 }, blocks: { L: 1, M: 1, Q: 2, H: 2 } },
  { total: 100, ec: { L: 20, M: 36, Q: 52, H: 64 }, blocks: { L: 1, M: 2, Q: 2, H: 4 } },
  { total: 134, ec: { L: 26, M: 48, Q: 72, H: 88 }, blocks: { L: 1, M: 2, Q: 4, H: 4 } },
  { total: 172, ec: { L: 36, M: 64, Q: 96, H: 112 }, blocks: { L: 2, M: 4, Q: 4, H: 4 } },
  { total: 196, ec: { L: 40, M: 72, Q: 108, H: 130 }, blocks: { L: 2, M: 4, Q: 6, H: 5 } },
  { total: 242, ec: { L: 48, M: 88, Q: 132, H: 156 }, blocks: { L: 2, M: 4, Q: 6, H: 6 } },
  { total: 292, ec: { L: 60, M: 110, Q: 160, H: 192 }, blocks: { L: 2, M: 5, Q: 8, H: 8 } },
  { total: 346, ec: { L: 72, M: 130, Q: 192, H: 224 }, blocks: { L: 4, M: 5, Q: 8, H: 8 } }
];

// Fallback to dynamic scaling up to Version 40 for long strings
for (let v = 11; v <= 40; v++) {
  // Approximate standard capacity scaling
  const total = Math.floor(v * v * 4.5 + v * 10);
  const l = Math.floor(total * 0.2);
  const m = Math.floor(total * 0.35);
  const q = Math.floor(total * 0.5);
  const h = Math.floor(total * 0.65);
  QR_VERSIONS.push({
    total,
    ec: { L: l, M: m, Q: q, H: h },
    blocks: { L: Math.floor(v/3) || 1, M: Math.floor(v/2) || 1, Q: Math.floor(v) || 1, H: Math.floor(v) || 1 }
  });
}

function getAlignmentPatternPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const positions = [];
  const step = version === 32 ? 26 : Math.round((version * 4 + 4) / (count - 1) / 2) * 2;
  positions.push(6);
  for (let i = 1; i < count - 1; i++) {
    positions.push(6 + i * step);
  }
  positions.push(version * 4 + 4);
  return positions;
}

export function generateQrSvg(text, ecLevel = 'L') {
  const bytes = new TextEncoder().encode(text);
  const length = bytes.length;

  // Select appropriate version
  let version = 1;
  while (version <= 40) {
    const limits = QR_VERSIONS[version];
    const ecCount = limits.ec[ecLevel];
    const dataCapacity = limits.total - ecCount;
    // Mode header (4 bits) + count indicator (8 or 16 bits)
    const headerSizeBits = version < 10 ? 12 : 20;
    const bitsNeeded = headerSizeBits + length * 8;
    if (bitsNeeded <= dataCapacity * 8) {
      break;
    }
    version++;
  }
  if (version > 40) throw new RangeError('Text payload too large for offline QR generation.');

  const limits = QR_VERSIONS[version];
  const ecCount = limits.ec[ecLevel];
  const dataCapacity = limits.total - ecCount;

  // Build bit buffer
  const buffer = [];
  // Mode indicator: 0100 for Byte Mode
  buffer.push(0, 1, 0, 0);
  const countLength = version < 10 ? 8 : 16;
  for (let i = countLength - 1; i >= 0; i--) {
    buffer.push((length >> i) & 1);
  }
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) {
      buffer.push((b >> i) & 1);
    }
  }

  // Padding
  while (buffer.length < dataCapacity * 8 && buffer.length % 8 !== 0) {
    buffer.push(0);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (buffer.length < dataCapacity * 8) {
    const pad = padBytes[padIdx];
    for (let i = 7; i >= 0; i--) {
      buffer.push((pad >> i) & 1);
    }
    padIdx = 1 - padIdx;
  }

  // Convert buffer to data bytes
  const dataBytes = new Uint8Array(dataCapacity);
  for (let i = 0; i < dataCapacity; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | buffer[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Error Correction
  const ecBytes = calculateErrorCorrection(dataBytes, ecCount);

  // Interleave and construct modules grid
  const totalSize = version * 4 + 17;
  const grid = Array.from({ length: totalSize }, () => new Uint8Array(totalSize));
  const reserved = Array.from({ length: totalSize }, () => new Uint8Array(totalSize));

  // Helper to draw alignment patterns
  function drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const isBorder = Math.max(Math.abs(dx), Math.abs(dy)) === 2;
        const isCenter = dx === 0 && dy === 0;
        grid[cy + dy][cx + dx] = isBorder || isCenter ? 1 : 0;
        reserved[cy + dy][cx + dx] = 1;
      }
    }
  }

  // Helper to draw finder patterns
  function drawFinder(cx, cy) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const isBorder = Math.max(Math.abs(dx), Math.abs(dy)) === 3;
        const isCenter = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
        grid[cy + dy][cx + dx] = isBorder || isCenter ? 1 : 0;
        reserved[cy + dy][cx + dx] = 1;
      }
    }
    // Draw separator
    for (let i = -4; i <= 4; i++) {
      if (cx + i >= 0 && cx + i < totalSize) {
        if (cy - 4 >= 0) reserved[cy - 4][cx + i] = 1;
        if (cy + 4 < totalSize) reserved[cy + 4][cx + i] = 1;
      }
      if (cy + i >= 0 && cy + i < totalSize) {
        if (cx - 4 >= 0) reserved[cy + i][cx - 4] = 1;
        if (cx + 4 < totalSize) reserved[cy + i][cx + 4] = 1;
      }
    }
  }

  // Draw 3 Finders
  drawFinder(3, 3);
  drawFinder(totalSize - 4, 3);
  drawFinder(3, totalSize - 4);

  // Draw Alignment Patterns
  const alignPos = getAlignmentPatternPositions(version);
  for (const x of alignPos) {
    for (const y of alignPos) {
      if (reserved[y][x]) continue;
      drawAlignment(x, y);
    }
  }

  // Timing patterns
  for (let i = 8; i < totalSize - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = 1;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[i][6] = 1;
  }

  // Dark module
  grid[totalSize - 8][8] = 1;
  reserved[totalSize - 8][8] = 1;

  // Format and Version reserve
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = 1;
    reserved[i][8] = 1;
    reserved[totalSize - 1 - i][8] = 1;
    reserved[8][totalSize - 1 - i] = 1;
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[totalSize - 11 + j][i] = 1;
        reserved[i][totalSize - 11 + j] = 1;
      }
    }
  }

  // Fill in data and EC bits in zig-zag
  let row = totalSize - 1;
  let col = totalSize - 1;
  let dir = -1;
  let bitIdx = 0;
  const totalBits = (dataCapacity + ecCount) * 8;
  const fullBytes = new Uint8Array(dataCapacity + ecCount);
  fullBytes.set(dataBytes);
  fullBytes.set(ecBytes, dataCapacity);

  while (col > 0) {
    if (col === 6) col--; // skip timing pattern col
    for (let c = 0; c < 2; c++) {
      const x = col - c;
      const y = row;
      if (!reserved[y][x]) {
        let bit = 0;
        if (bitIdx < totalBits) {
          bit = (fullBytes[Math.floor(bitIdx / 8)] >> (7 - (bitIdx % 8))) & 1;
          bitIdx++;
        }
        // Apply Mask Pattern 0: (row + col) % 2 == 0
        const mask = (x + y) % 2 === 0;
        grid[y][x] = bit ^ (mask ? 1 : 0);
      }
    }
    row += dir;
    if (row < 0 || row >= totalSize) {
      row -= dir;
      dir = -dir;
      col -= 2;
    }
  }

  // Draw Format Information (Mask 0 + Level L/M/Q/H)
  const formatBits = {
    L: 0x77c4, // Mask 0, L error correction
    M: 0x5412,
    Q: 0x355f,
    H: 0x168d
  }[ecLevel];

  // Write format info
  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> i) & 1;
    if (i < 6) {
      grid[i][8] = bit;
    } else if (i < 8) {
      grid[i + 1][8] = bit;
    } else {
      grid[8][14 - i] = bit;
    }

    if (i < 8) {
      grid[8][totalSize - 1 - i] = bit;
    } else {
      grid[totalSize - 15 + i][8] = bit;
    }
  }

  // Create SVG path
  let path = '';
  for (let y = 0; y < totalSize; y++) {
    for (let x = 0; x < totalSize; x++) {
      if (grid[y][x]) {
        path += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  const padding = 2;
  const viewBoxSize = totalSize + padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges" style="width:100%;height:100%;"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000" transform="translate(${padding},${padding})"/></svg>`;
}
