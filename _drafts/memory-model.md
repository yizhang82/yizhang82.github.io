# std::atomic vs volatile in x86

## What is the difference?

`std::atomic` provides atomic access to variables and the store/load provides acquire/release semantics by default. `volatile` only prevents compiler optimization (it may do more depending on compilers) so a read / write cannot be optimized away in case another thread might modify it.

## Is std::atomic still required if you have volatile?

To answer this question we need to understand the concept of memory model. Memory model is how hardware models memory access and what kind of ordering guaratee it provides. CPUs are typically either strong memory model (x86, etc) or weak memory model (ARM, etc). [This blog](https://preshing.com/20120930/weak-vs-strong-memory-models/) has one of the best description of weak memory model vs strong memory model. In particular, x86 CPU falls in the strong memory model category, which means *usually* load implies **acquire** semantics and load implies **release** semantics, but there is no guarantee with `#StoreLoad` ordering, as [observed in this example](https://preshing.com/20120515/memory-reordering-caught-in-the-act/). To better understand acquire/release semantics, you can refer to [this post](https://preshing.com/20120913/acquire-and-release-semantics/). So if you want your code to be correct and portable, and even in x86, the short answer is it's best to not take any chances and use `std::atomic`. It's better to be correct than *fast and wrong*. 

## But how much overhead it is for std::atomic in x86?

As a result of strong memory model, std::atmoic on x86 at least for reads actually doesn't have any overhead. It's easy to verify that by looking at disassembly code. I don't have a ARM machine so let's only look at this in terms of x86 compilation (at some point I might try cross-compilation). 

Suppose we have following code:

```c++
#include <atomic>
#include <stdio.h>

using namespace std;

std::atomic<int> x(0);
int main(void) {
    x.store(2);
    x.store(3);

    int y = x.load();
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
0000000000400470 <main>:
  400470:       48 83 ec 08             sub    $0x8,%rsp
  400474:       bf 30 06 40 00          mov    $0x400630,%edi
  400479:       31 c0                   xor    %eax,%eax
  40047b:       c7 05 b3 0b 20 00 02    movl   $0x2,0x200bb3(%rip)        # 601038 <__TMC_END__>
  400482:       00 00 00
  400485:       0f ae f0                mfence
  400488:       c7 05 a6 0b 20 00 03    movl   $0x3,0x200ba6(%rip)        # 601038 <__TMC_END__>
  40048f:       00 00 00
  400492:       0f ae f0                mfence
  400495:       8b 35 9d 0b 20 00       mov    0x200b9d(%rip),%esi        # 601038 <__TMC_END__>
  40049b:       e8 a0 ff ff ff          callq  400440 <printf@plt>
  4004a0:       31 c0                   xor    %eax,%eax
  4004a2:       48 83 c4 08             add    $0x8,%rsp
  4004a6:       c3                      retq
```

As you can see, the store inserted the mfence as a full memory barrier for x86 for store:

```
  40047b:       c7 05 b3 0b 20 00 02    movl   $0x2,0x200bb3(%rip)        # 601038 <__TMC_END__>
  400482:       00 00 00
  400485:       0f ae f0                mfence
```

But for reads it is just a regular read - reading a memory location into `esi`, which is the 2nd argument to printf as per [linux SystemV x64 ABI](https://raw.githubusercontent.com/wiki/hjl-tools/x86-psABI/x86-64-psABI-1.0.pdf):

```
  400495:       8b 35 9d 0b 20 00       mov    0x200b9d(%rip),%esi        # 601038 <__TMC_END__>
```

Note the `0x200b9d(%rip)` notation - it is simply trying to access the global at `0x601038` using `eip` as a starting point, which is the beginning of next instruction `0x40049b`, so `0x40049b` + `0x200b9d` = `0x601038`. The offset shifts based on the instruction in the read/writes but they all point to the same global.

## What if this is volatile?

If we replace the atomic to be a volatile, the result code looks like this:

```
0000000000400470 <main>:
  400470:       48 83 ec 08             sub    $0x8,%rsp
  400474:       c7 05 ba 0b 20 00 02    movl   $0x2,0x200bba(%rip)        # 601038 <__TMC_END__>
  40047b:       00 00 00
  40047e:       c7 05 b0 0b 20 00 03    movl   $0x3,0x200bb0(%rip)        # 601038 <__TMC_END__>
  400485:       00 00 00
  400488:       8b 35 aa 0b 20 00       mov    0x200baa(%rip),%esi        # 601038 <__TMC_END__>
  40048e:       bf 20 06 40 00          mov    $0x400620,%edi
  400493:       31 c0                   xor    %eax,%eax
  400495:       e8 a6 ff ff ff          callq  400440 <printf@plt>
  40049a:       31 c0                   xor    %eax,%eax
  40049c:       48 83 c4 08             add    $0x8,%rsp
  4004a0:       c3                      retq
```

You can see the `mfence` instruction is gone so the writes are faster, but the reads is still the same. 

## Taking out the volatile

Now let's just take out the volatile keyword, and see what we would get:

```
0000000000400470 <main>:
  400470:       48 83 ec 08             sub    $0x8,%rsp
  400474:       be 03 00 00 00          mov    $0x3,%esi
  400479:       bf 10 06 40 00          mov    $0x400610,%edi
  40047e:       31 c0                   xor    %eax,%eax
  400480:       c7 05 c6 0b 20 00 03    movl   $0x3,0x200bc6(%rip)        # 601050 <x>
  400487:       00 00 00
  40048a:       e8 b1 ff ff ff          callq  400440 <printf@plt>
  40048f:       31 c0                   xor    %eax,%eax
  400491:       48 83 c4 08             add    $0x8,%rsp
  400495:       c3                      retq
```

Now the read completely disappears, and the `mov $0x3, %esi` simply assigns 3 to `%esi` which is then passed to `printf@plt`. This isn't surprising because volatile prevents compilation optimizations and instead always force re-reading the memory location in case another thread might change it. Without volatile the compiler is free to assume no one is going to change `x` after `x = 3` so it is free to just pass 3 to printf.

## Conclusion

Multi-threading, memory-model, barriers are complicated topics but hopefully this gives you a good starting point.
