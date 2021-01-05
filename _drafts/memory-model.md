# std::atomic vs volatile in x86

This came up during a code review and the code was using `volatile` to ensure the access to the variable is atomic and serialized, and we were sort of debating whether it is sufficient, in particular:
1. Is it safer to switch to `std::atomic<T>`, and if so, why?
2. Is volatile sufficiently safe for a strong memory model CPU like x86

Most of us can probably agree that `std::atomic<T>` would be safer, but we need to dig a bit deeper to see why is it safer, and even for x86.

## What is the difference?

`std::atomic` provides atomic access to variables and provides different memory model access for store/load as well as bunch of multi-threading primitives. The default load and store provides sequential memory order guarantees.

`volatile` only prevents compiler optimization (it may do more depending on compilers) so a read / write cannot be optimized away in case another thread might modify it. But it provides no gaurantees in the hardware level, and no barrier is guaranteed. In some compilers (such as Visual C++) might insert barrier for you, but it isn't guaranteed - for example gcc gives you no barriers.

## Is std::atomic still required if you have volatile?

To answer this question we need to understand the concept of memory model. `volatile` only prevents compiler optimizations but CPU might still reorder operations and/or cache the writes, so the end result is hardware dependent. Memory model is how hardware models memory access and what kind of ordering and visibility guarantee it provides. CPUs are typically either strong memory model (x86, etc) or weak memory model (ARM, etc). [This blog](https://preshing.com/20120930/weak-vs-strong-memory-models/) has one of the best description of weak memory model vs strong memory model. In particular, x86 CPU falls in the strong memory model category, which means *usually* load implies **acquire** semantics and load implies **release** semantics, but there is no guarantee with `#StoreLoad` ordering, as [observed in this example](https://preshing.com/20120515/memory-reordering-caught-in-the-act/). To better understand acquire/release semantics, you can refer to [this post](https://preshing.com/20120913/acquire-and-release-semantics/). So if you want your code to be correct and portable, and even in x86, the short answer is it's best to not take any chances and use `std::atomic`. It's better to be correct than *fast and wrong*. 

## std::atomic under the hood for x86 

But you might wonder - what does `std::atomic<T>` do for x86 anyway? What is the magic?

It's easy to look into this by writing code using `std::atomic<T>` and disassemble it:

Suppose we have following code:

```c++
#include <atomic>
#include <stdio.h>

using namespace std;

std::atomic<int> x(0);
int main(void) {
    x.store(2);
    x.store(3, std::memory_order_release);

    int y = x.load();
    printf("%d", y);

    y = x.load(std::memory_order_acquire);
    printf("%d", y);

    return 0;
}
```

And let's compile it with optimization and dump out the disassembly:

```
g++ atomic.cc --std=c++11 -O3
objdump --all -d ./a.out > a
```

And the output of main looks as follows:

```
0000000000401040 <main>:
  401040:       48 83 ec 08             sub    $0x8,%rsp
  401044:       b8 02 00 00 00          mov    $0x2,%eax
  401049:       87 05 d9 2f 00 00       xchg   %eax,0x2fd9(%rip)        # 404028 <x>
  40104f:       bf 10 20 40 00          mov    $0x402010,%edi
  401054:       31 c0                   xor    %eax,%eax
  401056:       c7 05 c8 2f 00 00 03    movl   $0x3,0x2fc8(%rip)        # 404028 <x>
  40105d:       00 00 00
  401060:       8b 35 c2 2f 00 00       mov    0x2fc2(%rip),%esi        # 404028 <x>
  401066:       e8 c5 ff ff ff          callq  401030 <printf@plt>
  40106b:       8b 35 b7 2f 00 00       mov    0x2fb7(%rip),%esi        # 404028 <x>
  401071:       bf 10 20 40 00          mov    $0x402010,%edi
  401076:       31 c0                   xor    %eax,%eax
  401078:       e8 b3 ff ff ff          callq  401030 <printf@plt>
  40107d:       31 c0                   xor    %eax,%eax
  40107f:       48 83 c4 08             add    $0x8,%rsp
  401083:       c3                      retq

```

For the first `store(2, std::memory_order_seq_cst)` (the default) in x86, gcc made it a full barrier using xchg instruction which has a [implicit lock prefix](https://stackoverflow.com/questions/9027590/do-we-need-mfence-when-using-xchg):

```
  401049:       87 05 d9 2f 00 00       xchg   %eax,0x2fd9(%rip)        # 404028 <x>
```

Here the source is `%eax` = 2, the target of the move is address `rip` (=next instruction 0x40104f) + 0x2fd9 offset = 0x404028, which is the location of the global variable `x`.

If you are wondering what is the behavior of `operator =` - it is the equivalent of `store(std::memory_order_seq_cst)` 

> In some compilers you may get `mfence` which is *the* full barrier instruction in x86 CPU

Now to the second `store(3, std::memory_order_release)`. Recall under x86 all store has release semantics, so the code is just normal mov:

```
  401056:       c7 05 c8 2f 00 00 03    movl   $0x3,0x2fc8(%rip)        # 404028 <x>
```

Now let's look at reads.

For the first `load(std::memory_order_seq_cst)` (the default), given that in a sequential memory order a write already would publish the results to all cores with a full memory barrier, there is nothing we need to do. It is just a regular read - reading a memory location into `esi`, which is the 2nd argument to printf as per [linux SystemV x64 ABI](https://raw.githubusercontent.com/wiki/hjl-tools/x86-psABI/x86-64-psABI-1.0.pdf):

```
  401060:       8b 35 c2 2f 00 00       mov    0x2fc2(%rip),%esi        # 404028 <x>
```

For the 2nd `load(std::memory_order_acquire)`, again recall x86 every load is implicitly has acquire semantics, so again it is just a regular read:

```
  40106b:       8b 35 b7 2f 00 00       mov    0x2fb7(%rip),%esi        # 404028 <x>
```

## What if this is volatile?

If we replace the atomic to be a volatile:

```c++
#include <atomic>
#include <stdio.h>

using namespace std;

volatile int x(0);
int main(void) {
    x = 2;
    x = 3;

    int y = x;
    printf("%d", y);

    return 0;
}
```

The result code looks like this:

```
0000000000401040 <main>:
  401040:       48 83 ec 08             sub    $0x8,%rsp
  401044:       bf 10 20 40 00          mov    $0x402010,%edi
  401049:       31 c0                   xor    %eax,%eax
  40104b:       c7 05 d3 2f 00 00 02    movl   $0x2,0x2fd3(%rip)        # 404028 <x>
  401052:       00 00 00
  401055:       c7 05 c9 2f 00 00 03    movl   $0x3,0x2fc9(%rip)        # 404028 <x>
  40105c:       00 00 00
  40105f:       8b 35 c3 2f 00 00       mov    0x2fc3(%rip),%esi        # 404028 <x>
  401065:       e8 c6 ff ff ff          callq  401030 <printf@plt>
  40106a:       31 c0                   xor    %eax,%eax
  40106c:       48 83 c4 08             add    $0x8,%rsp
  401070:       c3                      retq
```

You can see the `xchg` becomes a simple `movl` as volatile doesn't guarantee any ordering - it only prevents compiler optimization. What optimization, you might ask? Let's see what happens when we remove the `volatile`.

## Taking out the volatile

Now let's just take out the volatile keyword, and see what we would get:

```
0000000000401040 <main>:
  401040:       48 83 ec 08             sub    $0x8,%rsp
  401044:       be 03 00 00 00          mov    $0x3,%esi
  401049:       bf 10 20 40 00          mov    $0x402010,%edi
  40104e:       31 c0                   xor    %eax,%eax
  401050:       c7 05 ce 2f 00 00 03    movl   $0x3,0x2fce(%rip)        # 404028 <x>
  401057:       00 00 00
  40105a:       e8 d1 ff ff ff          callq  401030 <printf@plt>
  40105f:       31 c0                   xor    %eax,%eax
  401061:       48 83 c4 08             add    $0x8,%rsp
  401065:       c3                      retq
```

You might have already noticed two significant differences:
* The assignment `x=2` is completely gone. compiler knows there are no side effects to the `x=2` assignment so it is free to optimize it away
* The read is completely gone, instead we assign `%esi = 3` for printf from the get go:

```
  401044:       be 03 00 00 00          mov    $0x3,%esi
```

Again, compiler is free to optimize the load because no one else is going to change `x` in between, so it can simply replace `x` with 3 in the printf.

## Conclusion

Multi-threading, memory-model, barriers are complicated topics but hopefully this gives you a good starting point. Even seemingly question like what is the difference of `volatile` and `atomic` can be quite confusing. If you are still hungry for more, there is [Linux Kernel Memory Barrier Doc](https://www.kernel.org/doc/Documentation/memory-barriers.txt) that has great details and every programmer does lock-free multi-thread programming or want to understand the details probably should read. 