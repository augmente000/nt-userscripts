interface ZipEntry {
    data: ArrayBuffer;
    name: string;
}

interface PreparedEntry {
    crc: number;
    data: Uint8Array<ArrayBuffer>;
    localOffset: number;
    name: Uint8Array<ArrayBuffer>;
}

const encoder = new TextEncoder();

function crcTable(): Uint32Array<ArrayBuffer> {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
}

const CRC_TABLE = crcTable();

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date): { date: number; time: number } {
    const year = Math.max(1980, date.getFullYear());
    return {
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    };
}

function localHeader(entry: PreparedEntry, timestamp: { date: number; time: number }): Uint8Array<ArrayBuffer> {
    const output = new Uint8Array(30 + entry.name.length);
    const view = new DataView(output.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, timestamp.time, true);
    view.setUint16(12, timestamp.date, true);
    view.setUint32(14, entry.crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, entry.name.length, true);
    view.setUint16(28, 0, true);
    output.set(entry.name, 30);
    return output;
}

function centralHeader(entry: PreparedEntry, timestamp: { date: number; time: number }): Uint8Array<ArrayBuffer> {
    const output = new Uint8Array(46 + entry.name.length);
    const view = new DataView(output.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, timestamp.time, true);
    view.setUint16(14, timestamp.date, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.data.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, entry.name.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.localOffset, true);
    output.set(entry.name, 46);
    return output;
}

function endRecord(entryCount: number, centralSize: number, centralOffset: number): Uint8Array<ArrayBuffer> {
    const output = new Uint8Array(22);
    const view = new DataView(output.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return output;
}

export function createZip(entries: ZipEntry[]): Blob {
    if (entries.length === 0 || entries.length > 0xffff) {
        throw new Error('ZIP must contain between 1 and 65535 files');
    }

    let localOffset = 0;
    const prepared: PreparedEntry[] = entries.map(entry => {
        const data = new Uint8Array(entry.data);
        const name = encoder.encode(entry.name);
        if (data.length > 0xffffffff || name.length > 0xffff) {
            throw new Error('A file is too large for a browser-created ZIP');
        }
        const preparedEntry = { crc: crc32(data), data, localOffset, name };
        localOffset += 30 + name.length + data.length;
        return preparedEntry;
    });
    if (localOffset > 0xffffffff) {
        throw new Error('The browser-created ZIP exceeds the 4 GiB ZIP limit');
    }

    const timestamp = dosTimestamp(new Date());
    const localParts = prepared.flatMap(entry => [localHeader(entry, timestamp), entry.data]);
    const centralParts = prepared.map(entry => centralHeader(entry, timestamp));
    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const parts = [...localParts, ...centralParts, endRecord(prepared.length, centralSize, localOffset)];
    return new Blob(parts, { type: 'application/zip' });
}
