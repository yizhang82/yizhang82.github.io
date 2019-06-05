---
layout: post
title:  "Sorting structured data using memcmp-friendly encoding part 2 - floats"
description: Sorting structured data using memcmp-friendly encoding part 2 - sorting floats
permalink: sorting-structured-data-2
comments: true
excerpt_separator: <!--more-->
categories:
- storage
- database
- C++
- algorithm
- design
---

In the [last post](/sorting-structured-data-1) we've discussed converting integers and strings into a memcmp / byte-comparable format for faster comparison (but at the trade off of doing decoding/encoding at reading/writing). In this post let's take a look at how do we do the same for floating pointers.

<!--more-->>

## IEEE floating point format

[IEEE 754] is the standard for floating points. Taking [float](https://en.wikipedia.org/wiki/Single-precision_floating-point_format) as an example:

Bit | 0 | 1-8 | 9-31 |
- | - | - | - |
Meaning | Sign (1 bit) | Exponent (8 bits) | Fraction (23 bits)

Note that bit 0 is MSB (Most Significant Bit), while bit 31 is LSB (Least Significant Bit). This is important when it comes to storing in memory and endian-ness of the machine. Contract to some people may believe, floating points are affected by endian-ness well. From wikipedia [Endianness](https://en.wikipedia.org/wiki/Endianness):

> Although the ubiquitous x86 processors of today use little-endian storage for all types of data (integer, floating point, BCD), there are a number of hardware architectures where floating-point numbers are represented in big-endian form while integers are represented in little-endian form.[18] There are ARM processors that have half little-endian, half big-endian floating-point representation for double-precision numbers: both 32-bit words are stored in little-endian like integer registers, but the most significant one first. Because there have been many floating-point formats with no "network" standard representation for them, the XDR standard uses big-endian IEEE 754 as its representation. It may therefore appear strange that the widespread IEEE 754 floating-point standard does not specify endianness.[19] Theoretically, this means that even standard IEEE floating-point data written by one machine might not be readable by another. However, on modern standard computers (i.e., implementing IEEE 754), one may in practice safely assume that the endianness is the same for floating-point numbers as for integers, making the conversion straightforward regardless of data type. (Small embedded systems using special floating-point formats may be another matter however.)

Looking at the bits in a bit more detail:

1. Sign bit represents the sign of the floating point. 0 is positive while 1 is negative. 
2. Exponent is a unsigned integer that needs to be subtracted by 127, so 1=-126, 255=128, etc. And exponent=0 has special meaning - that it is a a [denormal number](https://en.wikipedia.org/wiki/Denormal_number) that is less than 0 or 0.
3. The fraction is a series of bits that corresponds to 2^-n (where n = 1 ~ 23), with an implicit leading 1 (this is called normalized), unless exponent=0, and in such case there is no leading bit (denormalized). 

This is better explained with the following table:

Exponent | Fraction | Value |
- | - | - |
0 | 0 | +0 or -0 |
0 | 1~0x3ff | 2^-126 * 0.FractionBits |
0x1 ~ 0xfe | any | 2^(Exponent-127) * 1.FractionBits |
0xff | 0 | +infinity or -infinity
0xff | 0x1~0x3ff | NaN

Of course, you need to consider the sign bit as well, but that's implied.

## Converting into memcmp format

Once we understand the format, we can make the following observations:
1. For normalized positive floats, the exponent and fraction are lined up in a way that is ordered exactly right in terms of byte order. For example, exponent=1 would be [2^-126, 2^-125), and exponent=2 would be [2^-125, 2^-124), etc. So it is exactly like the positive integer case. 
2. For normalized negative floats, you need to flip the sign bit so that positive numbers are bigger than negative in terms of byte order. The rest of the bits also needs to be flipped as well given that the order of positive and order of negative numbers are reversed. 

> Note this is different with negative integers where they are stored in 2's compliment. In such case no flipping bits (other than the sign are necessary) as they are already flipped. 

3. For denormalized positive numbers, they are (0, 2^-126), so they are always smaller than the smallest normalized positive 2^-126, and that works out nicely as their exponent is 0. So for denormalized number in general they can be treat the same way as normalized numbers.

> It's apparent that the original IEEE 754 designers put a lot of thought into the floating point format design so that the ordering are aligned nicely.

4. +0 and -0 needs to be handled in a special manner as they would be worlds apart in terms of byte order given the only differentiating bit is the MSB. One can "normalize" (pardon the overloaded term) both of them into positive 0, and byte-wise that works out nicely as well since it is smaller than any denormalized / normalized numbers, once you flip the signed bit just like any other positive number.

5. +Infinity and -Infinity also works fine as their exponent is 0xff, so that makes positive infinity larger than any other positive numbers, and smaller than any negative numbers.

6. Of course, don't forget to account for endian-ness.

So in short, the algorithm would be as follows:

1. If +0 or -0, convert it to +0
2. If sign bit = 1, flip all the other bits
3. Flip the sign bit
4. Account for endian-ness

## What's next

We are done with most of the interesting memcmp format conversions. And they are a great trade off when your workload are read-heavy or have reasonable amount of cache to offset the required decoding. Comparing to I/O (and honestly, the rest of the database layers such as connection, transaction, caching, etc) the work required to encoding/decoding them is rather minimal in practice. There is an excellent data structure called [ART (Adaptive Index Tree)](https://db.in.tum.de/~leis/papers/ART.pdf) that is perfect for such memcmp / byte-comparable formats and we'll be looking at it in details in the next & final article.
