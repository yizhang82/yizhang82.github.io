---
layout: post
title:  "Doctest - a zero friction unit test framework with just enough features"
description: "Use doctest in every C++ project you have" 
permalink: 
comments: true
excerpt_separator: <!--more-->
categories:
- C++
- test
- framework 
---

In my personal C++ projects I've always been using [doctest](https://github.com/onqtam/doctest). It's simply awesome. It takes a few seconds to get bootstrapped and you are ready to run your tests. And it should really be the first thing you do when you start a new project.

For example, I've been using it in [neschan](https://github.com/yizhang82/neschan/) which is a NES emulator that I wrote for fun last year, and one such example is a few unit test that validates the emulated 6502 CPU works correctly:

[cpu_test.cpp](https://github.com/yizhang82/neschan/blob/master/test/cpu_test.cpp)

```c++
TEST_CASE("CPU tests") {
    nes_system system;

    SUBCASE("simple") {
        INIT_TRACE("neschan.instrtest.simple.log");

        cout << "Running [CPU][simple]..." << endl;

        system.power_on();

        system.run_program(
            {
                0xa9, 0x10,     // LDA #$10     -> A = #$10
                0x85, 0x20,     // STA $20      -> $20 = #$10
                0xa9, 0x01,     // LDA #$1      -> A = #$1
                0x65, 0x20,     // ADC $20      -> A = #$11
                0x85, 0x21,     // STA $21      -> $21=#$11
                0xe6, 0x21,     // INC $21      -> $21=#$12
                0xa4, 0x21,     // LDY $21      -> Y=#$12
                0xc8,           // INY          -> Y=#$13
                0x00,           // BRK 
            },
            0x1000);

        auto cpu = system.cpu();

        CHECK(cpu->peek(0x20) == 0x10);
        CHECK(cpu->peek(0x21) == 0x12);
        CHECK(cpu->A() == 0x11);
        CHECK(cpu->Y() == 0x13);
    }
}
```

It's pretty self-explanatory - use `TEST_CASE` to define a test case and `SUBCASE` for scenarios, and `CHECK` for actual validation/assertion. (Ignore `INIT_TRACE` - it's not part of the doctest framework)

To use it in your own project - just download one file:

```
curl https://raw.githubusercontent.com/onqtam/doctest/master/doctest/doctest.h -o doctest.h
```

And include that and add a #define:

```c++
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

int add(int a, int b) {
  return a + b;
}

TEST_CASE("testing 1+1=2") {
    CHECK(add(1,1) == 2);
}
```

The magic `DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN` is to tell doctest.h this file needs a main. You should only have it before `#include doctest.h` (obviously), so that the following code in `doctest.h` can kick in: 

```c++
#ifdef DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
DOCTEST_MSVC_SUPPRESS_WARNING_WITH_PUSH(4007) // 'function' : must be 'attribute' - see issue #182
int main(int argc, char** argv) { return doctest::Context(argc, argv).run(); }
DOCTEST_MSVC_SUPPRESS_WARNING_POP
#endif // DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
```

Note that you should only have this in a single file (perhaps a bit obvious). Other .cc/.cpp files just need to `#include "doctest.h"` without the `#define` - the linker wouldn't be happy more than one main function, after all. 

Compile and run:

> NOTE: --std=c++11 is required to use doctest, otherwise g++ would shout at you for feeding it nonsense

```
[~/tmp/test]: g++ test.cc --std=c++11 -o test
[~/tmp/test, 1s]: ./test
[doctest] doctest version is "2.3.1"
[doctest] run with "--help" for options
===============================================================================
[doctest] test cases:      1 |      1 passed |      0 failed |      0 skipped
[doctest] assertions:      1 |      1 passed |      0 failed |
[doctest] Status: SUCCESS!
```

It doesn't get simpler than this. When I say zero friction I really mean it. OK, maybe not entirely zero, but close enough.  

Note that the earlier `main` function calls out to `doctest::Context(argc, argv)`. This means that the final executable automatically comes with command line arguments you can use to control how the test executes, such as:
1. Test case filters
2. Listing all test cases / test suites
3. Running tests N times
4. And much more

If you are curious, `doctest.h` is giagantic 6000 line header file that got assembled from two files with a bit post-processing, if any of them changed:

[CMakeLists.txt](https://github.com/onqtam/doctest/blob/master/CMakeLists.txt)

```cmake
    # add a custom target that assembles the single header when any of the parts are touched
    add_custom_command(
        OUTPUT ${CMAKE_CURRENT_SOURCE_DIR}/doctest/doctest.h
        DEPENDS
            ${doctest_parts_folder}/doctest_fwd.h
            ${doctest_parts_folder}/doctest.cpp
        COMMAND ${CMAKE_COMMAND} -P ${CMAKE_CURRENT_SOURCE_DIR}/scripts/cmake/assemble_single_header.cmake
        COMMENT "assembling the single header")

    add_custom_target(assemble_single_header ALL DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/doctest/doctest.h)
```

[assemble_single_header.cmake](https://github.com/onqtam/doctest/blob/master/scripts/cmake/assemble_single_header.cmake)

```cmake
set(doctest_include_folder "${CMAKE_CURRENT_LIST_DIR}/../../doctest/")

file(READ ${doctest_include_folder}/parts/doctest_fwd.h fwd)
file(READ ${doctest_include_folder}/parts/doctest.cpp impl)

file(WRITE  ${doctest_include_folder}/doctest.h "// ====================================================================== lgtm [cpp/missing-header-guard]\n")
file(APPEND ${doctest_include_folder}/doctest.h "// == DO NOT MODIFY THIS FILE BY HAND - IT IS AUTO GENERATED BY CMAKE! ==\n")
file(APPEND ${doctest_include_folder}/doctest.h "// ======================================================================\n")
file(APPEND ${doctest_include_folder}/doctest.h "${fwd}\n")
file(APPEND ${doctest_include_folder}/doctest.h "#ifndef DOCTEST_SINGLE_HEADER\n")
file(APPEND ${doctest_include_folder}/doctest.h "#define DOCTEST_SINGLE_HEADER\n")
file(APPEND ${doctest_include_folder}/doctest.h "#endif // DOCTEST_SINGLE_HEADER\n")
file(APPEND ${doctest_include_folder}/doctest.h "\n${impl}")
```
This makes bootstraping the whole unit test essentially painless. You can just include a copy in your repo/folder and you are done. No need to fiddle with package manager / submodule. I wish more frameworks are done like this at least during distribution. Of course, assembling the entire boost library into a single header might be a bit extreme, but for simple frameworks where reducing friction of adoption is important, this can be a rather useful technique.


