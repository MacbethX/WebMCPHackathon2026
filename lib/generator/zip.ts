/**
 * A minimal ZIP writer, store-only.
 *
 * The export bundle is a handful of small text files. Compressing them would mean
 * either a DEFLATE implementation or a dependency, and neither buys anything on a few
 * kilobytes of source. Stored entries are a documented, universally readable ZIP; the
 * archive opens in Finder, Explorer, and `unzip` alike.
 *
 * Written against APPNOTE 6.3.x. The pieces that matter and are easy to get wrong:
 *
 *   - Every multi-byte field is little-endian.
 *   - The CRC-32 covers the uncompressed bytes.
 *   - The central directory repeats each entry, plus the offset of its local header.
 *   - Filenames are UTF-8, so general-purpose bit 11 is set to say so.
 *
 * The tests run the real `unzip` over the output, because a ZIP that only this file
 * agrees is a ZIP is worth nothing.
 */

export interface ZipEntry {
  /** Forward-slash separated path inside the archive. */
  path: string;
  content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what a ZIP header carries. */
function dosStamp(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    // DOS years count from 1980, and the format cannot express anything earlier.
    date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private size = 0;

  get length(): number {
    return this.size;
  }

  bytes(value: Uint8Array): void {
    this.chunks.push(value);
    this.size += value.length;
  }

  u16(value: number): void {
    this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.bytes(
      new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]),
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/** Filenames are UTF-8; bit 11 is how a reader is told that. */
const UTF8_NAME_FLAG = 0x0800;
const STORED = 0;

/**
 * Builds the archive.
 *
 * `modifiedAt` is a parameter rather than `new Date()` so the same entries produce
 * byte-identical output, which is what makes the tests meaningful.
 */
export function createZip(entries: readonly ZipEntry[], modifiedAt = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const stamp = dosStamp(modifiedAt);

  const local = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = encoder.encode(entry.content);
    const checksum = crc32(body);
    const offset = local.length;

    local.u32(0x04034b50); // local file header
    local.u16(20); // version needed
    local.u16(UTF8_NAME_FLAG);
    local.u16(STORED);
    local.u16(stamp.time);
    local.u16(stamp.date);
    local.u32(checksum);
    local.u32(body.length); // compressed size, same as uncompressed when stored
    local.u32(body.length);
    local.u16(name.length);
    local.u16(0); // extra field length
    local.bytes(name);
    local.bytes(body);

    central.u32(0x02014b50); // central directory header
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(UTF8_NAME_FLAG);
    central.u16(STORED);
    central.u16(stamp.time);
    central.u16(stamp.date);
    central.u32(checksum);
    central.u32(body.length);
    central.u32(body.length);
    central.u16(name.length);
    central.u16(0); // extra field length
    central.u16(0); // comment length
    central.u16(0); // disk number
    central.u16(0); // internal attributes
    central.u32(0o100644 << 16); // external attributes: a regular file, rw-r--r--
    central.u32(offset);
    central.bytes(name);
  }

  const localBytes = local.concat();
  const centralBytes = central.concat();

  const end = new ByteWriter();
  end.u32(0x06054b50); // end of central directory
  end.u16(0); // this disk
  end.u16(0); // disk with the central directory
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(centralBytes.length);
  end.u32(localBytes.length);
  end.u16(0); // comment length

  const out = new Uint8Array(localBytes.length + centralBytes.length + end.length);
  out.set(localBytes, 0);
  out.set(centralBytes, localBytes.length);
  out.set(end.concat(), localBytes.length + centralBytes.length);
  return out;
}
