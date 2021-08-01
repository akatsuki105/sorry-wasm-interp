import { Buffer, StackBuffer } from "./buffer.ts";
import { CodeNode, FuncTypeNode, InstrNode, ModuleNode } from "./node.ts";

// wasmモジュールをインスタンス化したもの
export class Instance {
  // モジュールをパースしたもの
  #module: ModuleNode;

  // エクスポートしている関数
  #exports: { [key: string]: any };

  // wasm関数
  #context: Context;

  get exports(): { [key: string]: any } {
    return this.#exports;
  }

  constructor(module: ModuleNode) {
    this.#module = module;
    this.#exports = {};
    this.#context = new Context();
  }

  compile() {
    const typeSection = this.#module.typeSection;
    const functionSection = this.#module.functionSection;
    const codeSection = this.#module.codeSection;

    // function
    functionSection?.typeIdxs.forEach((typeIdx, i) => {
      const func = new WasmFunction(
        typeSection!.funcTypes[typeIdx],
        codeSection.codes[i],
      );
      this.#context.functions.push(func);
    });

    // export
    const exportSection = this.#module.exportSection;
    exportSection?.exports.forEach((exp) => {
      if (exp.exportDesc?.tag === 0x00) {
        this.#exports[exp.name!] = (...args: number[]) => {
          const result = this.#context.functions[exp.exportDesc!.index!].invoke(
            this.#context,
            ...args,
          );
          return result;
        };
      }
    });
  }
}

// ローカル変数
class LocalValue {
  #type: number;
  value: number;

  constructor(type: number, value: number) {
    this.#type = type;
    this.value = value;
  }
}

// Typeセクション(シグネチャ)とCodeセクション(中身)を管理する
// invokeメソッドでそれを呼び出せるようにする
class WasmFunction {
  #funcType: FuncTypeNode;
  #code: CodeNode;

  constructor(funcType: FuncTypeNode, code: CodeNode) {
    this.#funcType = funcType;
    this.#code = code;
  }

  invoke(context: Context, ...args: number[]) {
    console.log(`args:${args}`);
  }
}

// wasmランタイムのコンテキスト
export class Context {
  stack: Buffer;
  functions: WasmFunction[];
  locals: LocalValue[];

  constructor() {
    this.stack = new StackBuffer({ buffer: new ArrayBuffer(1024) });
    this.functions = [];
    this.locals = [];
  }
}

class Instruction {
  parent?: Instruction;
  #next?: Instruction;

  get next(): Instruction | undefined {
    if (this.#next) {
      return this.#next;
    } else {
      // 次の親ノード
      return this.parent?.next;
    }
  }

  set next(instr: Instruction | undefined) {
    this.#next = instr;
  }

  constructor(parent?: Instruction) {
    this.parent = parent;
  }

  static create(node: InstrNode, parent?: Instruction): Instruction {
    return new Instruction();
  }

  // Contextを受け取って自身の命令を実行した後で次に実行する命令を返す
  invoke(context: Context): Instruction | undefined {
    throw new Error(`subclass responsibility; ${this.constructor.name}`);
  }
}

class InstructionSeq extends Instruction {
  #instructions: Instruction[] = [];

  get top(): Instruction | undefined {
    return this.#instructions[0];
  }

  constructor(nodes: InstrNode[] = [], parent?: Instruction) {
    super();

    if (nodes.length === 0) return;

    let prev = Instruction.create(nodes[0], parent);
    this.#instructions.push(prev);
    for (let i = 1; i < nodes.length; i++) {
      prev.next = Instruction.create(nodes[i], parent);
      this.#instructions.push(prev);
      prev = prev.next;
    }
  }

  invoke(context: Context): Instruction | undefined {
    return this.top;
  }
}
