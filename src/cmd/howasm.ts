import { WasmBuffer, WasmModule } from "../wasm.ts";

const { args: [opt, filename] } = Deno;

if (!filename) {
  console.error("no filename");
  Deno.exit(1);
}

const code = await Deno.readFile(filename);
const wasmBuffer = new WasmBuffer(code);
const wasmModule = new WasmModule();
wasmModule.load(wasmBuffer);

switch (opt) {
  case "-l": {
    console.log(JSON.stringify(wasmModule, null, "  "));
    break;
  }
  case "-s": {
    const u8s = new Uint8Array(code.byteLength);
    const outBuffer = new WasmBuffer(u8s);
    wasmModule.store(outBuffer);
    Deno.writeFile("out.wasm", new Uint8Array(outBuffer.buffer));
    break;
  }
}
