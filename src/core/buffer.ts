// helper class treats Binary data
export class Buffer {
  #cursor = 0;
  #buffer: ArrayBuffer;
  #view: DataView;

  constructor({ buffer }: { buffer: ArrayBuffer }) {
    this.#buffer = buffer;
    this.#view = new DataView(buffer);
  }

  get cursor(): number {
    return this.#cursor;
  }

  protected setCursor(c: number) {
    this.#cursor = c;
  }

  // #bufferはプライベートメソッドなのでgetterを用意
  get buffer(): ArrayBuffer {
    return this.#buffer;
  }

  readByte(): number {
    const bytes = this.readBytes(1);
    if (bytes.length <= 0) {
      return -1;
    }
    return bytes[0];
  }

  readBytes(size: number): Uint8Array {
    if (this.#buffer.byteLength < this.#cursor + size) {
      return new Uint8Array(0);
    }

    const slice = this.#buffer.slice(this.#cursor, this.#cursor + size);
    this.#cursor += size;
    return new Uint8Array(slice);
  }

  writeByte(byte: number) {
    this.#view.setUint8(this.#cursor++, byte);
  }

  writeBytes(bytes: ArrayBuffer) {
    const u8s = new Uint8Array(bytes);
    for (const byte of u8s) {
      this.writeByte(byte);
    }
  }

  // LEB128(unsigned)
  readU32(): number {
    let result = 0;
    let shift = 0;

    while (true) {
      const byte = this.readByte();
      result |= (byte & 0b0111_1111) << shift;
      shift += 7;
      if ((0b1000_0000 & byte) === 0) {
        return result;
      }
    }
  }

  // LEB128(signed)
  readS32(): number {
    let result = 0;
    let shift = 0;

    while (true) {
      const byte = this.readByte();
      result |= (byte & 0b0111_1111) << shift;
      shift += 7;
      if ((0b1000_0000 & byte) === 0) {
        if (shift < 32 && (byte & 0b0100_0000) !== 0) {
          return result | (~0 << shift);
        }
        return result;
      }
    }
  }

  readI32(): number {
    return this.readS32();
  }

  writeU32(value: number) {
    value |= 0; // u32
    const result = [];
    while (true) {
      const byte = value & 0b0111_1111; // 7bit
      value >>= 7;

      if (value === 0 && (byte & 0b0100_0000) === 0) {
        result.push(byte);
        break;
      }
      result.push(byte | 0b1000_0000);
    }

    const u8a = new Uint8Array(result);
    this.writeBytes(u8a.buffer);
  }

  writeS32(value: number) {
    value |= 0; // u32
    const result = [];
    while (true) {
      const byte = value & 0b0111_1111; // 7bit
      value >>= 7; // NOTE: 符号は維持される

      if (
        (value === 0 && (byte & 0b0100_0000) === 0) ||
        (value === -1 && (byte & 0b0100_0000) !== 0)
      ) {
        result.push(byte);
        break;
      }
      result.push(byte | 0b1000_0000);
    }

    const u8a = new Uint8Array(result);
    this.writeBytes(u8a.buffer);
  }

  writeI32(num: number) {
    this.writeS32(num);
  }

  readBuffer(size: number = this.#buffer.byteLength - this.#cursor): Buffer {
    return new Buffer(this.readBytes(size));
  }

  // <=> readBuffer
  append(buffer: Buffer) {
    this.writeU32(buffer.#cursor); // size
    for (let i = 0; i < buffer.#cursor; i++) {
      this.writeByte(buffer.peek(i));
    }
  }

  peek(pos = 0): number {
    return this.#view.getUint8(pos);
  }

  readVec<T>(readT: () => T): T[] {
    const vec = [];

    const size = this.readU32();
    for (let i = 0; i < size; i++) {
      vec.push(readT());
    }

    return vec;
  }

  writeVec<T>(ts: T[], writeT: (t: T) => void) {
    this.writeU32(ts.length);
    for (const t of ts) {
      writeT(t);
    }
  }

  readName(): string {
    const size = this.readU32();
    const bytes = this.readBytes(size);
    return new TextDecoder("utf-8").decode(bytes.buffer);
  }

  writeName(name: string) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(name);
    this.writeU32(bytes.length);
    this.writeBytes(bytes);
  }

  get byteLength(): number {
    return this.#buffer.byteLength;
  }

  get eof(): boolean {
    return this.byteLength <= this.#cursor;
  }
}

// バッファをスタックとして扱えるようにしたもの
export class StackBuffer extends Buffer {
  // pop
  readBytes(size: number): Uint8Array {
    if (this.cursor - size < 0) {
      return new Uint8Array(0);
    }
    const slice = this.buffer.slice(this.cursor - size, this.cursor);
    this.setCursor(this.cursor - size);
    return new Uint8Array(slice).reverse();
  }

  // push
  writeBytes(bytes: ArrayBuffer) {
    const u8s = new Uint8Array(bytes).reverse();
    for (const byte of u8s) {
      this.writeByte(byte);
    }
  }
}
