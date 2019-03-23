---
layout: post
title:  "This week in unnecessary C/C++ constness"
description: How much const is too much const? 
permalink: unnecessary-constness
comments: true
excerpt_separator: <!--more-->
categories:
- c 
- c++
- const
---

In some of the code I've seen recently, I've started noticed some disturbing trend - it's like there is too much *constness* for me to handle. I never thought that would be a real thing, but it just happened. 

Let's take a look at the first example:

```c
int add(const int a, const int b);
```

This is saying: I promise I'll never change the value of `a` and `b` during add. But does the caller care? You can decide if this makes sense to you. 

The next example use local const variables:

```c

const int count = get_count();
for (int i = 0; i < count; ++i) {
    // do something with i
}

```

The first two examples aren't that much different.

The next one is a bit more interesting and turns constness to 11:

```c
void read(const char *buffer);
void read(const char *const buffer);
```

A quick refresher on `const` on pointer:

1. `const char *` means you can't change the contents of the char * pointer
2. `char * const` means you can't change the char * pointer itself
3. `char const *` is identical to `const char *`.  

The first `void read(const char *buffer)` is reasonable and commonly seen: the buffer itself is for read and is not intended for write. The intention is clear. 

`void read(const char *const buffer)` turns constness up to 11 - now it even promises it won't change the buffer pointer - except that as a caller it means nothing to you. It's strictly for the callee only.

## Just my personal opinion - I hate overuse of const

My personal opinion is that `const` is most important as a contract between different parties. Most often that is caller and callee. It guaratees that the value won't be unexpectedly changed by the other party once it gets passed in, or out - and that's where the most problems tend to happen. On the other hand, having such contract within a single function is much less useful and in my opinion more harmful than useful, as the code can quickly gets littered with const to the point that it is hard to read and distracting, especially with `const char *const` pointers. Also, in the code that attempt to use const "correctly" they almost always struggle with consistently using it *everywhere* - inconsist use of const is worse than only using it in a few important places and use it right.

This can be an potentially dividing issue - just like any other programming language discussions. At the end of the day, it's a matter of preference. Let me know what you think in the comments.