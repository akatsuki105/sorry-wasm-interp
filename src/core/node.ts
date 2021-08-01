import { Buffer } from "./buffer.ts";

type I32 = 0x7f;
type I64 = 0x7e;
type F32 = 0x7d;
type F64 = 0x7c;
type NumType = I32 | I64 | F32 | F64;
type FuncRef = 0x70;
type ExternRef = 0x6f;
type RefType = FuncRef | ExternRef;
type ValType = NumType | RefType;

export class ModuleNode {
  magic?: Uint8Array;
  version?: Uint8Array;
  sections: SectionNode[] = [];

  load(buffer: Buffer) {
    this.magic = buffer.readBytes(4);
    this.version = buffer.readBytes(4);

    while (true) {
      if (buffer.eof) break;

      const section = this.loadSection(buffer);
      this.sections.push(section);
    }
  }

  // 1セクション読み進める
  loadSection(buffer: Buffer): SectionNode {
    const sectionId = buffer.readByte();
    const sectionSize = buffer.readU32();
    const sectonsBuffer = buffer.readBuffer(sectionSize);

    const section = SectionNode.create(sectionId);
    section.load(sectonsBuffer);
    return section;
  }

  store(buffer: Buffer) {
    if (this.magic) buffer.writeBytes(this.magic);
    if (this.version) buffer.writeBytes(this.version);

    for (const section of this.sections) {
      section.store(buffer);
    }
  }

  get typeSection(): TypeSectionNode {
    return this.sections.find((sec) =>
      sec instanceof TypeSectionNode
    ) as TypeSectionNode;
  }

  get exportSection(): ExportSectionNode {
    return this.sections.find((sec) =>
      sec instanceof ExportSectionNode
    ) as ExportSectionNode;
  }

  get functionSection(): FunctionSectionNode {
    return this.sections.find((sec) =>
      sec instanceof FunctionSectionNode
    ) as FunctionSectionNode;
  }

  get codeSection(): CodeSectionNode {
    return this.sections.find((sec) =>
      sec instanceof CodeSectionNode
    ) as CodeSectionNode;
  }
}

abstract class SectionNode {
  static create(sectionId: number): SectionNode {
    switch (sectionId) {
      case 1:
        return new TypeSectionNode();
      case 3:
        return new FunctionSectionNode();
      case 7:
        return new ExportSectionNode();
      case 10:
        return new CodeSectionNode();
      default:
        throw new Error(`invalid section id: ${sectionId}`);
    }
  }

  abstract load(buffer: Buffer): void;
  abstract store(buffer: Buffer): void;
}

// モジュール内に登場する関数の型を定義するセクション
// typesec := functype[]
//   - functype := [0x60, resulttype(引数), resulttype(返り値)]
//     - resulttype := valtype[]
//       - valtype := numtype | reftype
//         - numtype := 0x7f(i32) | 0x7e(i64) | 0x7d(f32) | 0x7c(f64)
//         - reftype := 0x70(funcref, 内部的に定義されている関数の参照) | 0x6f(externref, 外部的に与えられた関数の参照)
export class TypeSectionNode extends SectionNode {
  funcTypes: FuncTypeNode[] = [];

  load(buffer: Buffer) {
    this.funcTypes = buffer.readVec<FuncTypeNode>((): FuncTypeNode => {
      const functype = new FuncTypeNode();
      functype.load(buffer);
      return functype;
    });
  }

  store(buffer: Buffer) {
    buffer.writeByte(1);
    const sectionsBuffer = new Buffer({ buffer: new ArrayBuffer(1024) });
    sectionsBuffer.writeVec(this.funcTypes, (funcType: FuncTypeNode) => {
      funcType.store(sectionsBuffer);
    });
    buffer.append(sectionsBuffer);
  }
}

export class FuncTypeNode {
  static get TAG() {
    return 0x60;
  }

  paramType = new ResultTypeNode();
  resultType = new ResultTypeNode();

  load(buffer: Buffer) {
    if (buffer.readByte() != FuncTypeNode.TAG) {
      throw new Error("invalid functype");
    }

    this.paramType = new ResultTypeNode();
    this.paramType.load(buffer);
    this.resultType = new ResultTypeNode();
    this.resultType.load(buffer);
  }

  store(buffer: Buffer) {
    buffer.writeByte(FuncTypeNode.TAG);
    this.paramType.store(buffer);
    this.resultType.store(buffer);
  }
}

export class ResultTypeNode {
  valTypes: ValType[] = [];

  load(buffer: Buffer) {
    this.valTypes = buffer.readVec<ValType>((): ValType => {
      return buffer.readByte() as ValType;
    });
  }

  store(buffer: Buffer) {
    buffer.writeVec<ValType>(this.valTypes, (valType: ValType) => {
      buffer.writeByte(valType);
    });
  }
}

type TypeIdx = number;

// 関数のインデックスとその関数がどういう型を持つかを管理するセクション
// funcsec := typeidx[]
//   - typeidx := u32
export class FunctionSectionNode extends SectionNode {
  typeIdxs: TypeIdx[] = [];

  load(buffer: Buffer) {
    this.typeIdxs = buffer.readVec<TypeIdx>((): TypeIdx => {
      return buffer.readU32() as TypeIdx;
    });
  }

  store(buffer: Buffer) {
    buffer.writeByte(3);
    const sectionsBuffer = new Buffer({ buffer: new ArrayBuffer(1024) });
    sectionsBuffer.writeVec(this.typeIdxs, (typeIdx: TypeIdx) => {
      sectionsBuffer.writeU32(typeIdx);
    });
    buffer.append(sectionsBuffer);
  }
}

// 関数の本文(命令列)を管理するセクション
// codesec := code[]
//  - code := u32(size) + func
//    - func := locals[] + expr
//      - locals := u32(実際のローカル変数の値) + valtype
//      - expr := instr[] + 0x0b
//        - instr := 0x41 + i32(i32.const n を表す)
export class CodeSectionNode extends SectionNode {
  codes: CodeNode[] = [];

  load(buffer: Buffer) {
    this.codes = buffer.readVec<CodeNode>((): CodeNode => {
      const code = new CodeNode();
      code.load(buffer);
      return code;
    });
  }

  store(buffer: Buffer) {
    buffer.writeByte(10);
    const sectionsBuffer = new Buffer({ buffer: new ArrayBuffer(1024) });
    sectionsBuffer.writeVec(this.codes, (code: CodeNode) => {
      code.store(sectionsBuffer);
    });
    buffer.append(sectionsBuffer);
  }
}

export class CodeNode {
  size?: number;
  func?: FuncNode;

  load(buffer: Buffer) {
    this.size = buffer.readU32();
    const funcBuffer = buffer.readBuffer(this.size);
    this.func = new FuncNode();
    this.func.load(funcBuffer);
  }

  store(buffer: Buffer) {
    const funcBuffer = new Buffer({ buffer: new ArrayBuffer(1024) });
    this.func?.store(funcBuffer);
    buffer.append(funcBuffer);
  }
}

export class FuncNode {
  localses: LocalsNode[] = [];
  expr?: ExprNode;

  load(buffer: Buffer) {
    this.localses = buffer.readVec<LocalsNode>((): LocalsNode => {
      const locals = new LocalsNode();
      locals.load(buffer);
      return locals;
    });
    this.expr = new ExprNode();
    this.expr.load(buffer);
  }

  store(buffer: Buffer) {
    buffer.writeVec(this.localses, (locals: LocalsNode) => {
      locals.store(buffer);
    });
    this.expr?.store(buffer);
  }
}

// ローカル変数用の領域の確保
// locals := u32(ローカル変数用の領域の数?) + valtype
export class LocalsNode {
  num!: number;
  valType!: ValType;

  load(buffer: Buffer) {
    this.num = buffer.readU32();
    this.valType = buffer.readByte() as ValType;
  }

  store(buffer: Buffer) {
    buffer.writeU32(this.num);
    buffer.writeByte(this.valType);
  }
}

export class ExprNode {
  instrs: InstrNode[] = [];
  endOp!: Op;

  load(buffer: Buffer) {
    while (true) {
      const opcode = buffer.readByte() as Op;
      if (opcode === Op.End || opcode === Op.Else) {
        this.endOp = opcode;
        break;
      }

      const instr = InstrNode.create(opcode);
      if (!instr) {
        throw new Error(`invalid opcode 0x${opcode.toString(16)}`);
      }

      instr.load(buffer);
      this.instrs.push(instr);

      if (buffer.eof) break;
    }
  }

  store(buffer: Buffer) {
    for (const instr of this.instrs) {
      instr.store(buffer);
    }
    buffer.writeByte(this.endOp);
  }
}

export class InstrNode {
  opcode: Op;

  static create(opcode: Op): InstrNode | null {
    switch (opcode) {
      case Op.I32Const:
        return new I32ConstInstrNode(opcode);
      case Op.LocalGet:
        return new LocalGetInstrNode(opcode);
      case Op.LocalSet:
        return new LocalSetInstrNode(opcode);
      case Op.I32Add:
        return new I32AddInstrNode(opcode);
      case Op.I32Eqz:
        return new I32EqzInstrNode(opcode);
      case Op.I32LtS:
        return new I32LtSInstrNode(opcode);
      case Op.I32GeS:
        return new I32GeSInstrNode(opcode);
      case Op.I32RemS:
        return new I32RemSInstrNode(opcode);
      case Op.If:
        return new IfInstrNode(opcode);
      case Op.Block:
        return new BlockInstrNode(opcode);
      case Op.Loop:
        return new LoopInstrNode(opcode);
      case Op.Br:
        return new BrInstrNode(opcode);
      case Op.BrIf:
        return new BrIfInstrNode(opcode);
      case Op.Call:
        return new CallInstrNode(opcode);
      default:
        return null;
    }
  }

  constructor(opcode: Op) {
    this.opcode = opcode;
  }

  load(_: Buffer) {
    // nop
  }

  store(buffer: Buffer) {
    buffer.writeByte(this.opcode);
  }
}

// i32.const nn
export class I32ConstInstrNode extends InstrNode {
  num!: number;

  load(buffer: Buffer) {
    this.num = buffer.readI32();
  }

  store(buffer: Buffer) {
    super.store(buffer);
    buffer.writeI32(this.num);
  }
}

// local.get $var
export class LocalGetInstrNode extends InstrNode {
  localIdx!: number;

  load(buffer: Buffer) {
    this.localIdx = buffer.readU32();
  }
}

// local.set $var
export class LocalSetInstrNode extends InstrNode {
  localIdx!: number;

  load(buffer: Buffer) {
    this.localIdx = buffer.readU32();
  }
}

// +
export class I32AddInstrNode extends InstrNode {}

// == 0
export class I32EqzInstrNode extends InstrNode {}

// <
export class I32LtSInstrNode extends InstrNode {}

// >=
export class I32GeSInstrNode extends InstrNode {}

// mod
export class I32RemSInstrNode extends InstrNode {}

// エクスポートできるのは関数、テーブル、メモリ、グローバル変数
// - exportsec := export[]
//   - export := name + exportdesc
//      - name := byte(size) + byte[]
//      - exportdesc := byte(tag) + (0x00(funcidx) | 0x01(tableidx) | 0x02(memidx) | 0x03(globalidx))
export class ExportSectionNode extends SectionNode {
  exports: ExportNode[] = [];

  load(buffer: Buffer) {
    this.exports = buffer.readVec<ExportNode>((): ExportNode => {
      const ex = new ExportNode();
      ex.load(buffer);
      return ex;
    });
  }

  store(buffer: Buffer) {
    buffer.writeByte(7);
    const sectionsBuffer = new Buffer({ buffer: new ArrayBuffer(1024) });
    sectionsBuffer.writeVec(this.exports, (ex: ExportNode) => {
      ex.store(sectionsBuffer);
    });
    buffer.append(sectionsBuffer);
  }
}

export class ExportNode {
  name!: string;
  exportDesc!: ExportDescNode;

  load(buffer: Buffer) {
    this.name = buffer.readName();
    this.exportDesc = new ExportDescNode();
    this.exportDesc.load(buffer);
  }

  store(buffer: Buffer) {
    buffer.writeName(this.name);
    this.exportDesc.store(buffer);
  }
}

export class ExportDescNode {
  tag!: number;
  index!: number;

  load(buffer: Buffer) {
    this.tag = buffer.readByte();
    this.index = buffer.readU32();
  }

  store(buffer: Buffer) {
    buffer.writeByte(this.tag);
    buffer.writeU32(this.index);
  }
}

export class IfInstrNode extends InstrNode {
  blockType!: BlockType;
  thenInstrs!: ExprNode;
  elseInstrs?: ExprNode;

  load(buffer: Buffer) {
    this.blockType = buffer.readByte();
    this.thenInstrs = new ExprNode();
    this.thenInstrs.load(buffer);
    if (this.thenInstrs.endOp === Op.Else) {
      this.elseInstrs = new ExprNode();
      this.elseInstrs.load(buffer);
    }
  }
}

export class BlockInstrNode extends InstrNode {
  blockType!: BlockType;
  instrs!: ExprNode;

  load(buffer: Buffer) {
    this.blockType = buffer.readByte();
    this.instrs = new ExprNode();
    this.instrs.load(buffer);
  }
}

export class LoopInstrNode extends InstrNode {
  blockType!: BlockType;
  instrs!: ExprNode;

  load(buffer: Buffer) {
    this.blockType = buffer.readByte();
    this.instrs = new ExprNode();
    this.instrs.load(buffer);
  }
}

export class BrInstrNode extends InstrNode {
  labelIdx!: LabelIdx;

  load(buffer: Buffer) {
    this.labelIdx = buffer.readU32();
  }
}

export class BrIfInstrNode extends InstrNode {
  labelIdx!: LabelIdx;

  load(buffer: Buffer) {
    this.labelIdx = buffer.readU32();
  }
}

export class CallInstrNode extends InstrNode {
  funcIdx!: FuncIdx;

  load(buffer: Buffer) {
    this.funcIdx = buffer.readU32();
  }
}

const Op = {
  If: 0x04,
  Block: 0x02,
  Loop: 0x03,
  Br: 0x0c,
  BrIf: 0x0d,
  Call: 0x10,
  LocalGet: 0x20,
  LocalSet: 0x21,
  I32Const: 0x41,
  I32Eqz: 0x45,
  I32LtS: 0x48,
  I32GeS: 0x4e,
  I32Add: 0x6a,
  I32RemS: 0x6f,
  Else: 0x05, // 追加
  End: 0x0b,
} as const;
type Op = typeof Op[keyof typeof Op];
type S33 = number; // 33bit符号あり整数(ここでは簡略化のため32bitにする)
type BlockType = 0x40 | ValType | S33;
type LabelIdx = number;
type FuncIdx = number;
