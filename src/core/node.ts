import { Buffer } from "./buffer.ts";

export class ModuleNode {
  magic?: Uint8Array;
  version?: Uint8Array;

  load(buffer: Buffer) {
    this.magic = buffer.readBytes(4);
    this.version = buffer.readBytes(4);
  }
}
