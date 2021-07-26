(module
    (func (export "loop") (result i32)
        (local $i i32)
        (local $sum i32)

        (local.set $sum (i32.const 0)) ;; var sum i32 = 0
        (local.set $i (i32.const 0))   ;; var i i32 = 0
        (block $block (loop $loop   ;; block: 前向きジャンプ用ブロック, loop: 後ろ向きジャンプ用ブロック
            (br_if $block (i32.ge_s (local.get $i) (i32.const 3)))      ;; if (i >= 3) break;
            (local.set $i (i32.add (local.get $i) (i32.const 1)))       ;; i = i + 1
            (local.set $sum (i32.add (local.get $sum) (i32.const 14)))  ;; sum = sum + 14
            (br $loop)
        ))
        (local.get $sum)    ;; return value is top of stack, so push $sum
    )
)