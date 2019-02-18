---
layout: post
title:  "Sorting structured data in a unstructured way using memcmp-friendly encoding"
description: Sorting structured data in a unstructed way using memcmp-friendly encoding
permalink: 
comments: true
excerpt_separator: <!--more-->
categories:
- storage
- database
- C++
- algorithm
- design
---

In many interesting data storage applications, one often need to sort the data in order to do efficient searching - it is such a fundamental operation. The data is often structured like in databases (or it is using a database under the hood) - the application knows exactly what the data is - for example, a record/row with an integer field, a string field, as well as datetime field, etc. In those cases, you can easily sort these data by interpreting the data as what it is, and then comparing them one by one. This is usually achieved by having a base class with virtual functions, and having several derived class implementing the comparison function as well as determine the length to move the next one:

```c++
class Data {
 public:
  virtual int Compare(void *left, void *right) = 0;
  virtual int GetLength(void *data) = 0;
};

class UInt32_Data : public Data {
 public:
  virtual int Compare(void *left, void *right) {
    auto left_int = reinterpret_cast<uint32_t *>(left);
    auto right_int = reinterpret_cast<uint32_t *>(right);
    if (left_int < right_int) {
      return -1;
    } else if (left_int == right_int) {
      return 0;
    } else {
      return 1;
    }
  }
  virtual int GetLength(void *data) {
    // No need to read data - uint32_t is always fixed size
    return sizeof(uint32_t);
  }
};

```

You can merge these two function into one - for better efficiency. For clarity I'm keeping them separate. 

Besides virtual functions, you can also implement this with a jump table that points to a list of functions, or even a switch / case, etc. They are not that fundamentally different - all of them can involve having a table of address to call/jump to, and use a memory lookup to determine the target address.

However, the additional cost of invoking the right comparing functions isn't zero - as a matter fact it is quite significant comparing to the actual comparison function itself in the case of a virtual function call, which involves putting arguments into registry/stack, pushing return address into stack, setting up frame pointer, etc.  

If you are an experienced system programmer, you might know tricks to optimize this further. For example, given this is the exact same problem as an interpreter, and people like interpreter to be fast, VM like Dalvik employed [advanced techniques](http://wing-linux.sourceforge.net/online-pdk/guide/dalvik.html#dalvikInterpreter) like writing the code in assembly, using *threaded execution* (which is a fancy way of saying the end of interpreter loop decodes the next instruction instead of jumping to the beginning), and using computing address instead of jump table. These are interesting topics that I might talk about at some point in the future. Anyway, those are not easy to implement and maintain.

But are there other ways to get around this? Is there a way to compare this without understanding what the data is?

The most straight-forward comparison is a byte comparison or `memcmp`, and this is the most universal way to compare two byte sequences. Many key/value stores (like levelDB/RocksDB) only support byte comparison and allow you to plugin a custom comparator. But before you go ahead and try to implement the custom comparator, let's give one idea a try: what if we can represent the data somehow as a byte-comparison friendly format? 

The challenge are two fold:
1. Encoding the data so that byte order is the correct sorting order
2. Support variable length data properly so that you don't accidentally compare unrelated data

## Unsigned 32-bit integer

Let's start with something most straight-forward: a 32-bit unsigned integer. Assume you are working on a Intel machine just like everybody else (and not something esoteric like SPARC) - those unsigned 32-bit integers are represented as [little-endian](https://en.wikipedia.org/wiki/Endianness), which means least significant byte will be in memory before the most significant ones. So `0x12345678` will be represented in memory as:

```
0x78, 0x56, 0x34, 0x12
```

Obviously this isn't what we want - we need the compare the most significant byte first, which is exactly *Big-Endian*:

```
0x12, 0x34, 0x56, 0x78
```

Now it's safe to do a `memcmp` them now - the bytes are in most-significant to least significant order, and the length is fixed 4-bytes. 

Now those SPARC CPU looks pretty sweet, right? 

## Signed 32-bit

Let's make this a bit more interesting. What if the integer is signed?

For signed 32-bit, the range is `-2147483648` to `+2147483647`. There are two cases:
1. Negative: `-214783648` (`0x10000000`) to `-1` (`0xffffffff`),
2. Non-Negative: `0` (`0x00000000`) to `+2147483647` (`0x7fffffff`)

The non-negative case looks alright - just like the unsigned 32-bit integer case, as long as they are converted to Big-Endian. 

For the negative case, the order is correct: `-214783648` (`0x10000000`), `-214783647` (`0x10000001`), ... (`0xffffffff`), except the most significant bit is always one, which makes it bigger than the non-negative case. It is not hard to come up with a fix - just flip the sign bit. Now it becomes:
1. Non-Negative: `-214783648` (`0x00000000`) to `-1` (`0x7fffffff`),
2. Negative: `0` (`0x80000000`) to `+2147483647` (`0xffffffff`)

Now this looks really nice, and these two ranges are now in the right order, and -1 (0x7ffffffff)+1 = 0 (0x80000000). Now the universe is balanced. 

## 8-bit ASCII Strings

For strings, let's again start with the easy case - 8-bit ASCII strings (we'll refer it to ASCII string from now on, just for simplicity). For a fixed length ASCII string, it's really easy - memcmp just works. But how about variable length ASCII?

In such case, the real problem happens when you have string A and B and A is a prefix of B:

```
A: A, A, A, A, A, A
B: A, A, A, A, A, A, B, B, B
```

What if just after A there is other data:

```
A: A, A, A, A, A, A, 0x43
B: A, A, A, A, A, A, B, B 
```

In this case, 0x43 = 'C' which is bigger than B, even though A string is smaller than B. Oops.

The key to the problem is that you have to compare the two strings by themselves - you can't compare other unrelated data by accident (which is our challenge #2, earlier, if you paid attention). You could pad the strings so that they are equal, if you know the maximum length ahead of time (for example, in SQL VARCHAR has max length), but that can be a waste of space. 

If you dig deeper, one interesting insight is that if you can have a magic special character that is always guarantee to be smaller than any valid contents in the other string before it ends, then it'll just work. In many cases, we had no such luxury as strings may have embedded NULLs. But that does provide some additional hint: what if we can artifically inject such marker into the string such that the one that is longer has a bigger byte marker?

```
A: A, A, A, A, A, A, 0x0
B: A, A, A, A, A, A, 0x1, B, B, B, 0x0
```

In the above case, A ends with 0x0, while B injects 0x1 as 7th char, making sure it is bigger than A when A ends. Note that 0x1 in this case means there are more data after this, so the encoder/decoder need to take that into account. This looks nice, but we do need to make sure the markers are always at the same place. In order to do that, we can pad/break the strings to split them into predictable fixed length parts with a marker at the last byte. Let's say if we break it apart at 6 characters, it'll be exactly like this:

```
A: A, A, A, A, A, A, 0x0
B: A, A, A, A, A, A, 0x1, B, B, B, 0x0, 0x0, 0x0, 0x0
```

Note the 4 0x0 (' ') padding in between, making sure we break the strings every 6 characters. Now, any experienced programmer will tell you that you should always ends things at power of 2 (so that it works better with cache, alignment, etc), so 8/16/32/... would be obviously a better choice. For now let's go with 8 just to make it easier:

```
A: A, A, A, A, A, A, 0x0, 0x0
B: A, A, A, A, A, A,   A, 0x1, B, B, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0
```

A bit wasteful, but much better than storing the entire string padded to max length. Also, keep in mind that this encoding supports storing NULL characters as the 0 at every 8th character has special meaning. 

But we are not done yet. Do you see there is one more problem?

We are padding the strings with 0x0, and now the strings have some unwanted 0x0 characters padded which we are not able to distingush with actual spaces. Fortunately we still have plenty of run away with the encoding, we can put 1~8 there to indicate number of real characaters (not the padding):

```
A: A, A, A, A, A, A, 0x0, 0x0
B: A, A, A, A, A, A,   A, 0x2, B, B, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0
```

But this isn't quite right yet, this can easily get broken (thanks for [Thief](https://disqus.com/by/disqus_EhHho2AGRq/) pointing it out) as the marker themselves get into comparison:

```
A: A, A, A, A, A, A, A, 0x3, A, A,   A, 0x0, 0x0, 0x0, 0x0, 0x0
B: A, A, A, A, A, A, A, 0x2, B, B, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0
```

To fix this, instead of signaling the number of characters in next segment, it can represent the number of characters in the current segment:

```
A: A, A, A, A, A, A, A, 0x7, A, A, 0x0, 0x0, 0x0, 0x0, 0x0, 0x2
B: A, A, A, A, A, A, A, 0x7, A, A,   B, 0x0, 0x0, 0x0, 0x0, 0x3
```

For non-NULL characters, it'll work as any other character will be bigger. For embedded NULL characters, either the last non-NULL character would help:

```
A: A, A, A, A, A, A, A, 0x7, A, A, 0x0, 0x0, 0x0, 0x0, 0x0, 0x2
B: A, A, A, A, A, A, A, 0x7, A, A, 0x0,   A, 0x0, 0x0, 0x0, 0x4
```

Or for pure NULL padding case, the last 0x2/0x4 will help disambuigate any difference. 

```
A: A, A, A, A, A, A, A, 0x7, A, A, 0x0, 0x0, 0x0, 0x0, 0x0, 0x2
B: A, A, A, A, A, A, A, 0x7, A, A, 0x0, 0x0, 0x0, 0x0, 0x0, 0x4
```

This is still not quite perfect, though. If a string happens to end at N boundary:

```
A, A, A, A, A, A, A, 0x7, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0
```

The final N bytes are wasted just to provide the indicator. The fix is simple: instead of N - 1 indicating more characters, we can have two cases:
1. N - 1 : the segment is full and there are no more characters
2. N : the segment is full and there are more characters

To illustrate this idea:

```
A, A, A, A, A,   A,   A, 0x8, B, B, B, 0x0, 0x0, 0x0, 0x0, 0x3
A, A, A, A, A,   A,   A, 0x7 
A, A, A, A, A, 0x0, 0x0, 0x5  
```

In summary, we break down the string in the chunk of 8/16/32/... characters and using the every Nth character a special marker that indicates:
1. 0 = string ends
2. M = the current N-1 character segment has M (or M-1, if M = N) characters. If M = N there are more characters to come. 

## What about non-ASCII strings?

We can always convert it into a case that we know about - if we can convert such string into UTF-8, which works great in byte comparison even in the case of multi-byte characters. If you haven't looked at it yet, you should. It's brilliant, and everyone should be talking in UTF-8 (I'm looking at you, Windows). Just go to https://en.wikipedia.org/wiki/UTF-8. 

## What about sort ordering and collation? 

Those cases can get really complicated depends on the encoding + collation so I won't get into them. But the idea is always the same: transform the bytes into the correct sorting order as dicated by the character set/encoding. If the encoding byte order happens to be the right sorting order (UTF-8, for example), all the better. 

If you are interested you might want to give your favorite encoding a try. 

## We are not done yet

In this post I've discussed approaches to encode your data in a way that is sort friendly. In cases where there are lot of read/seek/lookup, it can make a really huge difference in terms of lookup performance, but in write heavy environments it may not be the right trade-off as the overhead of the encoding become bigger and the caching to offset the decoding cost become less effective. At the end of the day, there is no silver bullet and you need to pick the right solution for your scenario at hand.

However, we are not quite done yet. There is one more interesting scenario we can look at: floats. This is a non-trivial topic as we need to dive into the binary format of floats/doubles. Hope I'll see you next time! 

