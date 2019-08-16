---
layout: post
title:  "SWIG and Python3 unicode"
description: 
permalink: swig-and-python3-unicode
comments: true
excerpt_separator: <!--more-->
categories:
- python 
- languages 
- fun 
---

Anyone familiar with Python probably knew its history of Unicode support. If you add Python3, Unicode, and SWIG together, imagine what might go wrong? 


# Python3, Unicode, SWIG, and me

I was debugging a test failure written in Python just now and it is failing with this error:

> Many of the end-to-end tests here are written in Python because they are convenient - no one wants to write a C++ code to drive MySql and our infra service to do a series of stuff. 

```
UnicodeEncodeError: 'latin-1' codec can't encode character '\udcfa' in position 293: ordinal not in range(256)
```

The code looks like this:

```py
sql = get_sql_from_some_magic_place()
decoded_sql = cUnescape(sql.decode("latin-1"))
decoded_sql_str = decoded_sql.encode("latin-1")
execute(decoded_sql_str)
```

The code seems straight-forward enough. The offending string looks like this: `b"SELECT from blah WHERE col='\\372'`. 

This string was originally escaped by `folly::cEscape` which does simple thing rather simple - converts the string to be a C representation where '\' are double escaped and any non-printable characters are escaped with octal. This is convenient as those escaped strings are safe to pass around without worry for encoding as they are, well, ASCII.

> folly is Facebook's open source standard C++ library collection. See https://github.com/facebook/folly for more information.

It is convenient, until you need to call from Python, for which you'll need to use SWIG:

> If you don't know SWIG - just think it's a tool that generates Python wrapper for C++ code so that they can be called from Python code. In this case, folly::cUnescape. Go to http://www.swig.org/ to learn more. Many language have equivalent tool/feature built-in, P/invoke in C#, cgo in go, JNI in Java, etc. 

```
std::string cUnescape(const std::string& a) {
  std::string b;
  folly::cUnescape(a, b);
  return b;
}
```

I was scratching my ahead trying to understand what is happening as there is no way the strings are converted to '\udcfa', until I realize `cUnescape` might be at fault.

It turns out, SWIG expects UTF-8 string and returns UTF-8 strings back. "\\372" can be converted to UTF-8 without any trouble, but once it is unescaped it becomes "\372" which is 0xfa that is going to be interpreted as UTF-8:

```py
b"\372".decode("utf-8", errors="surrogateescape").encode("latin-1")
```

And you get:

```
UnicodeEncodeError: 'latin-1' codec can't encode character '\udcfa' in position 0: ordinal not in range(256)
```

# The fix

To fix the problem, you can encode the buffer again with surrogateescape:

```py
>>> b"\372".decode("utf-8", errors="surrogateescape").encode("utf-8", errors="surrogateescape").decode("latin-1")
'ú'
```

Seems rather backwards, isn't it? Why not just stop messing with the strings?

That's exactly what was discussed in SWIG doc here: http://www.swig.org/Doc4.0/Python.html#Python_nn77. There is a magic macro you can use:

```
%module char_to_bytes
%begin %{
#define SWIG_PYTHON_STRICT_BYTE_CHAR
%}
std::string cUnescape(const std::string& a) {
  std::string b;
  folly::cUnescape(a, b);
  return b;
}
```

And the original code can be changed to:

```py
sql = get_sql_from_some_magic_place()
decoded_sql = cUnescape(sql).decode("latin-1")
execute(decoded_sql)
```

Much simpler too.

I'm just happy that I mostly write C++ instead of Python... 
