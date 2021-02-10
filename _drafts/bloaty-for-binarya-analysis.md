---
layout: post
title: "Bloaty: A super handy linux binary analysis"
description: 
permalink: bloaty-size-analysis 
comments: true
excerpt_separator: <!--more-->
categories:
- linux
- tools
---

[bloaty](https://github.com/google/bloaty) is a great tool from Google for binary size analysis. We were just wondering why the binary size became so large for our code in production and bloaty is great at that.

For example, if you run it against a release build of bloaty itself, just for fun:

```
./bloaty -d sections ./bloaty
    FILE SIZE        VM SIZE
 --------------  --------------
  35.8%  16.2Mi   0.0%       0    .debug_info
  25.3%  11.4Mi   0.0%       0    .debug_loc
  11.6%  5.26Mi   0.0%       0    .debug_str
   6.5%  2.93Mi   0.0%       0    .debug_ranges
   6.3%  2.83Mi  42.5%  2.83Mi    .rodata
   5.7%  2.60Mi   0.0%       0    .debug_line
   4.4%  2.00Mi  29.9%  2.00Mi    .text
   0.0%       0  15.1%  1.01Mi    .bss
   1.3%   585Ki   0.0%       0    .strtab
   1.0%   441Ki   6.5%   441Ki    .data
   0.7%   316Ki   0.0%       0    .debug_abbrev
   0.6%   279Ki   4.1%   279Ki    .eh_frame
   0.5%   235Ki   0.0%       0    .symtab
   0.1%  50.3Ki   0.7%  50.3Ki    .eh_frame_hdr
   0.1%  46.9Ki   0.7%  46.8Ki    .gcc_except_table
   0.1%  38.3Ki   0.0%       0    .debug_aranges
   0.0%  14.2Ki   0.1%  7.80Ki    [24 Others]
   0.0%  7.78Ki   0.1%  7.72Ki    .dynstr
   0.0%  6.20Ki   0.1%  6.14Ki    .dynsym
   0.0%  4.89Ki   0.1%  4.83Ki    .rela.plt
   0.0%  3.30Ki   0.0%  3.23Ki    .plt
 100.0%  45.2Mi 100.0%  6.66Mi    TOTAL
```

You can easily tell most of the size is actually debug information - 79.2% (35.8+25.3+11.6+6.5)! This is actually a pretty common pattern for C++ binarie and most of the size is debug info. These debug symbols can be offloaded to a symbol package and installed on-demand for coredumps and debugging if needed, if size is becoming an issue.

Another interesting analysis you can do is to look at how much each file is contributing to your different sections (text, string, etc). Again, using bloaty itself as an example:

```
./bloaty -d sections,compileunits ./bloaty

...
4.4%  2.00Mi  29.9%  2.00Mi    .text
    33.7%   688Ki  33.7%   688Ki    [117 Others]
     9.4%   193Ki   9.4%   193Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/descriptor.cc
     6.2%   125Ki   6.2%   125Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/descriptor.pb.cc
     5.6%   115Ki   5.6%   115Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/AArch64/AArch64InstPrinter.c
     4.6%  94.6Ki   4.6%  94.6Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/Sparc/SparcInstPrinter.c
     4.6%  93.3Ki   4.6%  93.3Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/ARM/ARMDisassembler.c
     4.1%  83.3Ki   4.1%  83.3Ki    /home/yzha/local/github/bloaty/src/bloaty.cc
     3.9%  79.3Ki   3.9%  79.3Ki    /home/yzha/local/github/bloaty/third_party/demumble/third_party/libcxxabi/cxa_demangle.cpp
     3.8%  78.7Ki   3.8%  78.7Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/PowerPC/PPCInstPrinter.c
     3.0%  62.1Ki   3.0%  62.1Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/text_format.cc
     2.8%  56.9Ki   2.8%  56.9Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/generated_message_reflection.cc
     2.5%  50.1Ki   2.5%  50.1Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/extension_set.cc
     2.3%  46.0Ki   2.3%  46.0Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/ARM/ARMInstPrinter.c
     2.1%  42.2Ki   2.1%  42.2Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/map_field.cc
     2.1%  42.1Ki   2.1%  42.1Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/wire_format.cc
     2.0%  40.6Ki   2.0%  40.6Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/SystemZ/SystemZDisassembler.c
     1.7%  34.0Ki   1.7%  34.0Ki    /home/yzha/local/github/bloaty/src/dwarf.cc
     1.5%  30.9Ki   1.5%  30.9Ki    /home/yzha/local/github/bloaty/src/elf.cc
     1.5%  30.2Ki   1.5%  30.2Ki    /home/yzha/local/github/bloaty/third_party/protobuf/src/google/protobuf/repeated_field.cc
     1.5%  30.1Ki   1.5%  30.1Ki    /home/yzha/local/github/bloaty/third_party/capstone/arch/AArch64/AArch64Disassembler.c
     1.3%  27.0Ki   1.3%  27.0Ki    /home/yzha/local/github/bloaty/third_party/re2/re2/re2.cc
...
```

It looks like protobuf is a big contributor. Now we can add source filter to see how much:

```
./bloaty -d sections,compileunits --source-filter=protobuf ./bloaty
...
 100.0%  24.1Mi 100.0%  1013Ki    TOTAL
Filtering enabled (source_filter); omitted file = 21.1Mi, vm = 5.67Mi of entries
```

There are a lot of output here, but you can see protobuf contributs to 24.1/45.2=53% of size of bloaty itself. If you want you can also dive into different sections to see how much each individual files contributes to as well.