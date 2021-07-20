import { WasmBuffer, WasmModule } from "../src/wasm.ts";
import { assertEquals } from "https://deno.land/std@0.93.0/testing/asserts.ts";

Deno.test("load module.wat", async () => {
  const code = await Deno.readFile("data/module.wasm");
  const wasmBuffer = new WasmBuffer(code);
  const wasmModule = new WasmModule();

  wasmModule.load(wasmBuffer);
  assertEquals(new Uint8Array([0x00, 0x61, 0x73, 0x6d]), wasmModule.magic);
  assertEquals(new Uint8Array([0x01, 0x00, 0x00, 0x00]), wasmModule.version);
});
