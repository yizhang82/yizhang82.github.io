---
layout: post
title:  "Python3 filter is evil"
description: 
permalink: python3-filter-is-evil 
comments: true
excerpt_separator: <!--more-->
categories:
- python 
- languages 
- fun 
---

Personally I like Python for what it is - a quick prototype language for writing simple utilities/scripts. Unfortunately when you start writing important infrastructure code using Python it quickly falls apart due to its dynamic typing. And all the breaking changes in Python3 didn't help either.

<!--more-->

I've been debugging an internal tooling that fails to copy over database data to another instance. Not surprisingly it is written in Python. The place that does the copy looks like the following:

```python

file_list = filter(lambda i : is_supported(i), file_list)

for i in file_list:
    # do some preparation

for i in file_list:
    # copy some files

for i in file_list:
    # load it into database
```

Looking at the log, it indicates only the first loop has been iterated but not the 2nd/3rd. There are no changes to `file_list` in between. 

When looking at it under `pdb`, this gives the ultimate clue:

```
(Pdb) print(file_list)
<filter object at 0x7f02ccc5f828>
```

In [Python 2 doc](https://docs.python.org/2/library/functions.html):

> filter(function, iterable)
> Construct a list from those elements of iterable for which function returns true. iterable may be either a sequence, a container which supports iteration, or an iterator. If iterable is a string or a tuple, the result also has that type; otherwise it is always a list. If function is None, the identity function is assumed, that is, all elements of iterable that are false are removed.

In [Python3 doc](https://docs.python.org/3/library/functions.html):

>filter(function, iterable)
>Construct an iterator from those elements of iterable for which function returns true. iterable may be either a sequence, a container which supports iteration, or an iterator. If function is None, the identity function is assumed, that is, all elements of iterable that are false are removed.

Note the change from list to iterator! Being an iterator means that it keeps track its position and iterating it the 2nd time would simply yield nothing...

Honestly I'm horrified by this breaking change as it is breaking in both type and semantics:
1. It changes from a list to a iterator
2. List is an iterable (that can be iterated many times) but iterator can only be iterated once. 

I think whoever made this design change probably has good intentions in mind, as having an iterator can enable lazy evaluation without creating an copy of the entire list, but making this an iterable would be so much better.

> I understand that Python3 is supposed to be a breaking change. However I feel that there are better ways to fix the language while being compatible with previous versions - it'll significantly increase the adoption of the new language and ease the pain of transition. 

The fix is very simple: 

```python
file_list = list(filter(lambda i : is_supported(i), file_list))
```

When I talked about this story, Python language experts in the team suggests writing in list comprehensions:

```python
file_list = [ i for i in file_list if is_supported(i) ]
```

> I must admit I'm no Python expert because I couldn't get myself to work through the 1000+ Learning Python book and I still couldn't resist writing semicolon at the end of each statement...


Now I can't wait to fully transition to using Go for any non-system coding - anything that is not a database, interpreter, compiler, virtual machine, file system driver, or kernel. But hey, people have written [database in go](https://github.com/cockroachdb/cockroach), so you never know.
