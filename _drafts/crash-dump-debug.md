---
layout: post
title:  "A tale of dump debugging"
description: 
permalink: 
comments: true
excerpt_separator: <!--more-->
categories:
- mysql 
- database
- crash
- linux
- dump 
---

# A tale of dump debugging

## The corrupted stack

Right when you load up the dump, you'll see the scary `???`:

```
#0  __pthread_kill (threadid=<optimized out>, signo=11)
#1  0x0000000002b4daee in my_write_core (sig=11)
#2  handle_fatal_signal (sig=11)
#3  0x00007fda9028f6e0 in sigpending (set=0x1a7bc0)
#4  0x0000000000000007 in ?? ()
#5  0x0000000000000000 in ?? ()
```

Obviously this isn't too helpful. But there is a way we can reconstruct the stack.

In most cases stack walking are done with RBP-chain, basically a link list of stack frames established linked together with `%rbp`, and some times it gets broken in signals, gets corrupted, or simply optimized away (this is called FPO - frame pointer optimization). But you can usually reconstruct at least portion of the stack by following the RBP-chain manually.

The RBP-chain is established with function prolog that usually looks like this:

```
Dump of assembler code for function log_line_duplicate(_log_line*, _log_line*):
   0x000000000467f970 <+0>:     push   %rbp
   0x000000000467f971 <+1>:     mov    %rsp,%rbp
```

Whenever a function is called, the following would happen:
* The call instruction pushes the return address into the stack
* The prolog advances `%rsp` pointer, and pushes the current ebp (which is from previous function) onto `%rsp`, which is basically what push does
* Updates the `%rbp` to current `%rsp`
* Note in this case, you have the current `%rbp` pointing to the previous `%rbp`! Hence the RBP-chain.

So this effectively means, if you know the latest `%rbp`, you can follow it all the way to the entire stack of function calls just following the link list of `%rbp` (at least most of the time), and using the `%rbp` we could see the return address of each function in the stack as well, therefore using `%rbp`+offset we can access the frame variables within any particular function in the stack.

This is our current `%rbp`

```
(gdb) print $rbp
$2 = (void *) 0x7ffd682379b0
```

So following the chain:

```
(gdb) x/2a 0x7ffd682379b0
0x7ffd682379b0: 0x7ffd682379f0  0x2b4daee <handle_fatal_signal(int)+974>
(gdb) x/2a 0x7ffd682379f0
0x7ffd682379f0: 0x7ffd68238730  0x7fda9028f6e0 <sigpending+16>
(gdb) x/2a 0x7ffd68238730
0x7ffd68238730: 0x7ffd68238790  0x4680ad9 <log_sink_buffer(void*, _log_line*)+169>
(gdb) x/2a 0x7ffd68238790
0x7ffd68238790: 0x7ffd682388c0  0x214b4d8 <log_line_submit(_log_line*)+1640>
(gdb) x/2a 0x7ffd682388c0
0x7ffd682388c0: 0x7ffd6823b330  0x27228eb <log_vmessage(int, __va_list_tag*)+2587>
(gdb) x/2a 0x7ffd6823b330
0x7ffd6823b330: 0x7ffd6823b410  0x1f7dff2 <log_message(int, ...)+130>
(gdb) x/2a 0x7ffd6823b410
0x7ffd6823b410: 0x7ffd6823b6e0  0x38120df <init_slave()+2831>
```

Keep in mind that because stack grows downwards in x86 (address becomes smaller), and GDB prints memory upwards (address become bigger), so you'll see `%rbp` first then followed by the function return address, even though we push the address first and then push the `%rbp` later.

So effectively you have:

```
%rbp=0x7ffd682379f0, function=0x2b4daee <handle_fatal_signal(int)+974>
%rbp=0x7ffd68238730, function=0x7fda9028f6e0 <sigpending+16>
%rbp=0x7ffd68238730, function=0x4680ad9 <log_sink_buffer(void*, _log_line*)+169>
%rbp=0x7ffd682388c0, function=0x214b4d8 <log_line_submit(_log_line*)+1640>
%rbp=0x7ffd6823b330, function=0x27228eb <log_vmessage(int, __va_list_tag*)+2587>
%rbp=0x7ffd6823b410, function=0x1f7dff2 <log_message(int, ...)+130>
%rbp=0x7ffd6823b6e0, function=0x38120df <init_slave()+2831>
```

Now we have the stack. However, this stack isn't truly complete most likely because of signal processing, but we'll get to that later.

## Recovering the lost function

Now `0x214b4d8 log_sink_buffer(void*, _log_line*)+169` is obviously the first thing that we should look at first:

```
(gdb) disassemble 0x4680ad9
...
   0x0000000004680ace <+158>:   mov    %rbx,%rdi
   0x0000000004680ad1 <+161>:   mov    %r14,%rsi
   0x0000000004680ad4 <+164>:   callq  0x467f970 <log_line_duplicate(_log_line*, _log_line*)>
   0x0000000004680ad9 <+169>:   mov    0x38(%r15),%eax     // <-------- return address
```

Clearly we are landing inside `log_line_duplicate`, but this is nowhere in the stack. This is where a creative search might be useful. We can start showing symbols downwards from the current %rbp, and there is a obviously a big gap between `0x7ffd68238730` (log_sink_buffer) and `0x7ffd682379f0` (sipending), so what we are looking for must be in between:

```
(gdb) x/200a 0x7ffd68238730-200
...
0x7ffd682386d0: 0x7ffd68238730  0x467fae4 <log_line_duplicate(_log_line*, _log_line*)+372>
...
```

And not surprisingly, it lines up perfectly with the `%rbp 0x7ffd68238730` so we can confirm this is part of the chain as well.

## Finding the crash

Looking at the disassemly for `0x467fae4 <log_line_duplicate(_log_line*, _log_line*)+372>`:

```
(gdb) disassemble 0x467fae4 
...
   0x000000000467fab9 <+329>:   mov    %rsi,0x8(%rax)
   0x000000000467fabd <+333>:   mov    0xc056c(%rip),%rax        # 0x4740030 <psi_memory_service>
   0x000000000467fac4 <+340>:   lea    0x10(%rbx),%rdx
   0x000000000467fac8 <+344>:   mov    %r14d,%edi
   0x000000000467facb <+347>:   callq  *0x8(%rax)
   0x000000000467face <+350>:   mov    %eax,(%rbx)
   0x000000000467fad0 <+352>:   add    $0x20,%rbx
   0x000000000467fad4 <+356>:   je     0x467fb2d <log_line_duplicate(_log_line*, _log_line*)+445>
   0x000000000467fad6 <+358>:   mov    %rbx,%rdi    0x000000000467fad9 <+361>:   mov    %r15,%rsi
   0x000000000467fadc <+364>:   mov    %r13,%rdx 
   0x000000000467fadf <+367>:   callq  0x46ea880 <memcpy@plt>
   0x000000000467fae4 <+372>:   movb   $0x0,(%rbx,%r13,1)  // <-------------- return address
```

It's clear that we are crashing inside `memcpy@plt` (which eventually goes to `__memmove_avx_unaligned_erms`), so most likely one of the input arguments src/dst is bad - now we just need to decipher its arguments.

Based on the [linux calling convention](https://en.wikipedia.org/wiki/X86_calling_conventions), `%rdi`, `%rsi`, `%rdx` are the first 3 arguments (left to right), so %rdi is dst, %rsi is dst, and %rdx is size.

> In short, Linux in AMD64 is using SystemV AMD64 calling convention where the first 6 arguments are passed from registers RDI, RSI, RDX, RCX, R8, R9; additional arguments are passed in stack, from right to left. Return value is in RAX.

This is where things get a bit tricker - we don't know the exact values of `%rdi`/`%rsi`/`%rdx` at the time of the crash. Ideally the signal handler should capture the CPU context and therefore all its registers (at least that's how SEH works in Windows), here we have to rely on a bit of leg work and reading the code.

Looking at [log_line_duplicate](https://github.com/mysql/mysql-server/blob/8.0/sql/server_component/log_builtins.cc#L696), the logic is fairly straight-forward, it loops over src/dst log_line one by one and call strdup to copy key and data_string.str:

```c++
/**
  Duplicate a log-event. This is a deep copy where the items (key/value pairs)
  have their own allocated memory separate from that in the source item.

  @param   dst    log_line that will hold the copy
  @param   src    log_line we copy from

  @retval  false  on success
  @retval  true   if out of memory
*/
bool log_line_duplicate(log_line *dst, log_line *src) {
  int c;

  *dst = *src;

  for (c = 0; c < src->count; c++) {
    dst->item[c].alloc = LOG_ITEM_FREE_NONE;

    if ((dst->item[c].key =
             my_strndup(key_memory_log_error_loaded_services, src->item[c].key,
                        strlen(src->item[c].key), MYF(0))) != nullptr) {
      // We just allocated a key, remember to free it later:
      dst->item[c].alloc = LOG_ITEM_FREE_KEY;

      // If the value is a string, duplicate it, and remember to free it later!
      if (log_item_string_class(src->item[c].item_class) &&
          (src->item[c].data.data_string.str != nullptr)) {
        if ((dst->item[c].data.data_string.str = my_strndup(
                 key_memory_log_error_loaded_services,
                 src->item[c].data.data_string.str,
                 src->item[c].data.data_string.length, MYF(0))) != nullptr)
          dst->item[c].alloc |= LOG_ITEM_FREE_VALUE;
        else
          goto fail; /* purecov: inspected */
      }
    } else
      goto fail; /* purecov: inspected */
  }
}
```

Both src/dst are `log_line *` which is basically kinda like a `vector`:

```c++
/**
  log_line ("log event")
*/
typedef struct _log_line {
  log_item_type_mask seen;      ///< bit field flagging item-types contained
  log_item_iter iter;           ///< iterator over key/value pairs
  int count;                    ///< number of key/value pairs ("log items")
  log_item item[LOG_ITEM_MAX];  ///< log items
} log_line;
```

Recall that the calling convention indicates `%rsi` and `%rdi` are the first two arguments to this function, we just need to track them to a stack location where we can retrieve with `%rbp+offset`. 

From the disassembly you can see `%rsi`, `%rdi` is assigned to `%rbx`, `%r14`:

```
0x000000000467f981 <+17>: mov %rsi,%rbx        // now %rbx is dst
0x000000000467f984 <+20>: mov %rdi,%r14        // now %r14 is src
```

Then later they got saved in the stack:

```
...
0x000000000467f99b <+43>: mov %r14,-0x40(%rbp) // src saved in %rbp-0x40
...
0x000000000467f9a9 <+57>: mov %rbx,-0x48(%rbp) // dst saved in %rbp-0x48
```

Therefore, we can get src/dst from `%rbp-0x40` and `%rbp-0x48`, respectively:

```
(gdb) set $src=(log_line *)(*((void **)(0x7ffd68238730-0x48)))
(gdb) set $dst=(log_line *)(*((void **)(0x7ffd68238730-0x40)))
```

We can confirm whether the data is correct by looking at `log_line::count` field:

```
(gdb) print $src->count
$61 = 6
(gdb) print $dst->count
$62 = 6
```

So they all have 6 items. Checks out. You can also print out the individual items. For example, the first item is an `LOG_ITEM_LOG_PRIO` item with integer value of 3:

```
(gdb) print $src->item[0]
$69 = {type = LOG_ITEM_LOG_PRIO, item_class = LOG_INTEGER, key = 0xecaf16 "prio", data = {data_integer = 3,
    data_float = 1.4821969375237396e-323, data_string = {str = 0x3 <error: Cannot access memory at address 0x3>, length = 0}}, alloc = 0}
``` 

Coming back to the code again, now the rest should be fairly straight-forward: by inspecting the src/dst and infer the copy progress comparing with the code. Fortunately the code is fairly good about keep tracking of allocations (in alloc field, as it needs to free them eventually, after all):

```c++
  *dst = *src;

  for (c = 0; c < src->count; c++) {
    dst->item[c].alloc = LOG_ITEM_FREE_NONE;
    if ((dst->item[c].key =
             my_strndup(key_memory_log_error_loaded_services, src->item[c].key,
                        strlen(src->item[c].key), MYF(0))) != nullptr) {
      // We just allocated a key, remember to free it later:
      dst->item[c].alloc = LOG_ITEM_FREE_KEY;

      // If the value is a string, duplicate it, and remember to free it later!
      if (log_item_string_class(src->item[c].item_class) &&
          (src->item[c].data.data_string.str != nullptr)) {
        if ((dst->item[c].data.data_string.str = my_strndup(
                 key_memory_log_error_loaded_services,
                 src->item[c].data.data_string.str,
                 src->item[c].data.data_string.length, MYF(0))) != nullptr)
          dst->item[c].alloc |= LOG_ITEM_FREE_VALUE;
  }
```

So the ones that have been successfully allocated would have `alloc` = 1 (`LOG_ITEM_FREE_KEY`) or 3 (`LOG_ITEM_FREE_KEY | LOG_ITEM_FREE_VALUE`).

Also you can infer whether the copy has happened by compare the memory address in `data_string.str` to see if it has been updated with a new value (that comes from `my_strdup`).

After a bit of code reading and comparing `log_line::item` from `src`/`dst`, one can determine that this item is the first one that have been copied, because it's `alloc = 1` so it has copied the `key` but not the `data_string`:

```
$67 = {type = LOG_ITEM_LOG_MESSAGE, item_class = LOG_LEX_STRING, key = 0x7fda78b27380 "msg", data = {data_integer = 140726350615296,
    data_float = 6.9528055303627921e-310, data_string = {
      str = 0x7ffd68239300 "Resetting GTID_EXECUTED: old : ...", length = 24708}}, alloc = 1}
```

And looking at the actual string, its length is exactly 8K:

```
(gdb) x/2s 0x7ffd68239300 
0x7ffd68239300: "Resetting GTID_EXECUTED: old ..... "
0x7ffd6823b300: ""
(gdb) print 0x7ffd6823b300-0x7ffd68239300
$68 = 8192
```

8K is obviously less than `length=24708`, but the code copies `data_string.length` bytes. We can confirm the memory isn't accessible:

```
(gdb) x  0x7ffd68239300+24708-8
0x7ffd6823f37c: Cannot access memory at address 0x7ffd6823f37c
```

So the bug is clear: the code is truncating at 8K boundary but the length remains untruncated.

## Show me the bug

The following code is the formatting code in `log.cc`. See if you can spot the bug and collect the extra cool ninja psychic debugging points:

```c++
int log_vmessage(int log_type MY_ATTRIBUTE((unused)), va_list fili) 
      /* ... */
      size_t msg_len = vsnprintf(buff, sizeof(buff),
                                 ll.item[ll.count].data.data_string.str, fili);

      buff[sizeof(buff) - 1] = '\0';
      ll.item[ll.count].data.data_string.str = buff;
      ll.item[ll.count].data.data_string.length = msg_len;
```