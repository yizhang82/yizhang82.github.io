---
layout: post
title:  "Finding data mismatch in MySQL"
description: Description 
permalink: eternal-terminal-magical 
comments: true
excerpt_separator: <!--more-->
categories:
- linux
- tools 
---


```
cmp data-a data-b -b
data-a data-b differ: byte 12292525506, line 62369352 is  60 0  65 5
```

Believe it or not, the value 60 / 65 is the octal number of the byte value while 0 and 5 are the actual characters:

From cmp.cc in diffutils code:

```c++
unsigned char c0 = buf0[first_diff];
unsigned char c1 = buf1[first_diff];
char s0[5];
char s1[5];
sprintc (s0, c0);
sprintc (s1, c1);
printf (_("%s %s differ: byte %s, line %s is %3o %s %3o %s\n"),
        file[0], file[1], byte_num, line_num,
        c0, s0, c1, s1);
```

So 060 = 48 = 0x30 = '0', and 065 = 53 = 0x35 = '5'


```bash
cat data-a | less -N
```

It's important to add `-N` to show line numbers so that you can locate the correct line without getting lost. You can use `<line>G` to locate the correct line but you may end up getting confused whether the top line or the bottom line is the line in question - I know I did. So having that line number would definitely clarify confusion.


