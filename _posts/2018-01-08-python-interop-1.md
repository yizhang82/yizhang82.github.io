---
layout: post
title:  "Calling C functions from Python - part 1 - using ctypes"
date:   2018-01-08
description: Calling C functions from Python - part 1 - using ctypes
permalink: python-interop-ctypes
comments: true
categories:
- python
- interop
- ctypes
---

Recently I've been evaluating Python interop technologies for a project at work and I think it'll made an interesting blog series.  

Let's say your have following C code (add `extern "C"` if you are in C++ land) and compile it into a dynamic library (`dll`/`.so`/`.dylib`):

```c
    int Print(const char *msg)
    {
        printf("%s", msg);
        return 0;
    }
    
    int Add(int a, int b)
    {
        return a + b;
    }
    
    struct Vector
    {
        int x;
        int y;
        int z;
    };

    struct Vector AddVector(struct Vector a, struct Vector b)
    {
        Vector v;
        v.x = a.x + b.x;
        v.y = a.y + b.y;
        v.z = a.z + b.z;
        return v;
    }

    typedef struct Vector (*pfnAddVectorCallback)(struct Vector a, struct Vector b);

    struct Vector AddVectorCallback(pfnAddVectorCallback callback, struct Vector a, struct Vector b)
    {
        return callback(a, b);
    }
```

One of the ways to call C API from Python is to use [ctypes](https://docs.python.org/2/library/ctypes.html) module. The tutorial in docs.python.org is fairly comprehensive and I certainly don't intend to cover everything in the tutorial. 

Instead, I'll cover it in a exploratory style to show you how what I did to understand these API, and add some fairly interesting details of the API not quite covered by the tutorial (some of the behavior of the API are a bit obscure). 

In a future post I'll also deep dive into ctypes implementation in [CPython](https://github.com/python/cpython), but for me to get to that, I need to cover the Python C API first in part 2 first, which makes the deep dive part 3. :) 

Anyway, let's get started.

## Getting started

First let's import the ctypes module:

```py
>>> from ctypes import *
```

To load a module, you can use `cdll`, `windll`, `oledll` library loader objects.

For example, to load kernel32, you can do:

```py
>>> cdll.kernel32
<CDLL 'kernel32', handle 56930000 at 508eb70>
>>> print vars(cdll)
{'kernel32': <CDLL 'kernel32', handle 56930000 at 508eb70>, '_dlltype': <class 'ctypes.CDLL'>}
```

Basically accessing its attribute would automatically load a DLL by name. This is implemented in Python by overriding  [`__getattr__`](https://docs.python.org/2/reference/datamodel.html#object.__getattr__) and does a LoadLibrary. Obviously this either requires the DLL to be already loaded or searchable using various rules. Since every process effectively has kernel32.dll loaded in the process, you'll always load kernel32 successfully.

Let's say we built our dll as MyDll, and try to load it:

```py
>>> cdll.MyDll
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "C:\Python27\lib\ctypes\__init__.py", line 436, in __getattr__
    dll = self._dlltype(name)
  File "C:\Python27\lib\ctypes\__init__.py", line 366, in __init__
    self._handle = _dlopen(self._name, mode)
WindowsError: [Error 126] The specified module could not be found
```

Well, that didn't work. This is because MyDll is not locatable in path, application directory, nor system32. 

OK. Let's try again using `cdll.LoadLibrary`:

```py
>>> cdll.LoadLibrary(r"D:\Projects\MyDll\Debug\mydll.dll")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "C:\Python27\lib\ctypes\__init__.py", line 444, in LoadLibrary
    return self._dlltype(name)
  File "C:\Python27\lib\ctypes\__init__.py", line 366, in __init__
    self._handle = _dlopen(self._name, mode)
WindowsError: [Error 193] %1 is not a valid Win32 application
```

Hmm.. That didn't work either. Unfortunately the error didn't provide a good description of the actual problem. The problem is that I've compiled my dll as a 32-bit DLL while Python.exe is 64-bit, so it doesn't think it's a valid (64-bit) application (win32 application is just a general term for 32-bit/64-bit windows applications, as opposed to 16-bit windows).

Recompiling the DLL as 64-bit fixed it:

```py
>>> cdll.LoadLibrary(r"D:\Projects\MyDll\x64\Debug\mydll.dll")
<CDLL 'D:\Projects\MyDll\x64\Debug\mydll.dll', handle 4cae0000 at 5064ac8>
```

Interestingly, it doesn't really show up in cdll, until you access `cdll.mydll`:

```py
>>> print vars(cdll)
{'kernel32': <CDLL 'kernel32', handle 56930000 at 508eb70>, '_dlltype': <class 'ctypes.CDLL'>}
>>> cdll.mydll
<CDLL 'mydll', handle 4cae0000 at 509d5f8>
```

This is because `cdll.LoadLibrary` only returns a new instance of `CDLL` object. Because garbage collector didn't kick in yet, the DLL is still loaded in this process, and therefore accessing cdll.mydll would "just work". However, do note that these two mydlls are separate Python objects (`5064ac8` vs `509d5f8`), but pointing to the same library (`56930000`).

However, the best way is to keep the instance in a variable - there is no point loading this library twice (there is no harm though as DLL has a ref-count maintained by the OS and you wouldn't load two copies - there is just one as long as it is the same one).

```py
>>> mydll = cdll.LoadLibrary(r"D:\Projects\MyDll\x64\Debug\mydll.dll")
```

## Calling the function

Let's try calling `Print` - just call it as a magic attribute:

```py
>>> print vars(mydll)
{'_FuncPtr': <class 'ctypes._FuncPtr'>, '_handle': 140734480777216L, '_name': 'D:\\Projects\\MyDll\\x64\\Debug\\mydll.dll'}

>>> ret = mydll.Print("abc\n")
abc

>>> print vars(mydll)
{'Print': <_FuncPtr object at 0x0000000005501528>, '_FuncPtr': <class 'ctypes._FuncPtr'>, '_handle': 140734480777216L, '_name': 'D:\\Projects\\MyDll\\x64\\Debug\\mydll.dll'}
```

Note that calling mydll.Print magically inserts a new attribute on the mydll object. Again, this is achieved through [`__getattr__`](https://docs.python.org/2/reference/datamodel.html#object.__getattr__)

So how does ctypes call Print internally? A few things happens:
* ctypes does a GetProcAddress (or `dlsym`) on `Print` to get the internal address
* ctypes automatically recognize that you are passing a "abc", and converts it to a char *
* ctypes uses [FFI](https://sourceware.org/libffi/) to make the call, using `cdecl` calling convention. CDll by default uses cdecl.

Now let's try doing an `Add`:

```py
>>> mydll.Add(1, 2)
3
```

There is a bit ctypes magic at play: by default ctypes assumes every function returns a int, so this works out fairly well. If you want a different return type, you can change it by assigning a type to `restype` attribute. In this case, what we need is ctypes.c_char, which is the 1-byte char type in C.

```py
>>> mydll.Add.restype = c_char
>>> mydll.Add(97, 1)  # this can be dangerous!
'b'
```

Now Add would interpret the returned int automatically as a char. Note that this can be dangerous as the size of int and char aren't exactly the same. However, in most platforms / calling conventions, return value are returned via a register (EAX/RAX in intel platforms), so this simply involves a truncation and work out fine. But again, you don't want to make such assumptions. So this is just for illustration purpose only.

Besides CDLL, there is also `windll` and `oledll`. `windll` by default treat the function as stdcall, and `oledll` would treat it as a COM function, which means accessing the function by an vtable offset, with stdcall, and returning HRESULT. 

## Define your own struct

Let's take a look at how to define your own struct. You can do that by deriving from `ctypes.Structure` type, and supply a set of fields through the magic `_fields_` attribute:

```py
>>> class VECTOR(Structure):
...     _fields_ = [("x", c_int), ("y", c_int), ("z", c_int)]
...
```

If you print out the individual fields in the `VECTOR` type, you'll see magic attributes showing up: 

```py
>>> print VECTOR.x, VECTOR.y, VECTOR.z
<Field type=c_long, ofs=0, size=4> <Field type=c_long, ofs=4, size=4> <Field type=c_long, ofs=8, size=4>
```

Note that the individual fields are nicely laid out sequentially (ofs=0, 4, 8), just what you would expect from a good old C struct.

Now we can create new instances of VECTOR and return back VECTOR:

```py
>>> vector_a = VECTOR(1, 2, 3)
>>> vector_b = VECTOR(2, 3, 4)
>>> mydll.AddVector.restype = VECTOR
>>> vector_c = mydll.AddVector(vector_a, vector_b)
>>> print vector_c.x, vector_c.y, vector_c.z
3 5 7
```

## Calling python code from C and some surpises

Let's make this a bit more interesting. Let's try to call AddVectorCallback while passinging a python function. To do this you need to make a callback function type first: 

```py
>>> ADDVECTORCALLBACK = CFUNCTYPE(VECTOR, VECTOR, VECTOR)
```

With this type we can then define a Python function that does the add:

```py
>>> def AddVectorImpl(a, b):
...     return VECTOR(a.x + b.x, a.y + b.y, a.z + b.z)
...
>>> mydll.AddVectorCallback(ADDVECTORCALLBACK(AddVectorImpl), VECTOR(1, 2, 3), VECTOR(2, 3, 4))
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: invalid result type for callback function
```

Unfortunately, this doesn't work. Only simple data types like c_int are supported. Complex data types like struct/union are not, because they didn't provide a setfunc. We'll cover more of these details in a future deepdive ctypes post. 

```c
        StgDictObject *dict = PyType_stgdict(restype);
        if (dict == NULL || dict->setfunc == NULL) {
          PyErr_SetString(PyExc_TypeError,
                          "invalid result type for callback function");
          goto error;
        }
```

The workaround is to pass in a pointer instead:

```c
    typedef void (*pfnAddVectorCallback)(struct Vector a, struct Vector b, struct Vector *c);

    struct Vector AddVectorCallback(pfnAddVectorCallback callback, struct Vector a, struct Vector b)
    {
        Vector c;
        callback(a, b, &c);
        return c;
    }
```

```py
>>> ADDVECTORCALLBACK = CFUNCTYPE(None, VECTOR, VECTOR, POINTER(VECTOR))
>>> def AddVectorImpl(a, b, c):
...     c.contents = VECTOR(a.x + b.x, a.y + b.y, a.z + b.z)
```

And let's see if it works:

```py
>>> vector = mydll.AddVectorCallback(ADDVECTORCALLBACK(AddVectorImpl), VECTOR(1,2,3), VECTOR(2,3,4))
>>> print vector.x, vector.y, vector.z
-858993460 -858993460 -858993460
```

OK. So nope. Appears that setting `contents` doesn't do what we want. Reading the code - it actually simply swap the internal pointers of the pointer object and doesn't do any assignment!

```c
    *(void **)self->b_ptr = dst->b_ptr;
```

The correct way is to assign it on the VECTOR object returned from `contents` attribute directly:

```py
>>> def AddVectorImpl(a, b, c):
...     c.contents.x = a.x + b.x
...     c.contexts.y = a.y + b.y
...     c.contents.z = a.z + b.z
>>> vector = mydll.AddVectorCallback(ADDVECTORCALLBACK(AddVectorImpl), VECTOR(1,2,3), VECTOR(2,3,4))
>>> print vector.x, vector.y, vector.z
3 5 7
```

The reason this works is that the VECTOR object internal b_str pointer points directly to the Vector struct pointed by Vector*, so changing this VECTOR object changes the output Vector struct. 

## What's next

As previously mentioned, I'll cover Python C API in the next post and dive into ctypes implementation in CPython (which are written using python C API).

I'll update them with links once they become available:

* [Part 1 - CTypes](/python-interop-ctypes)
* [Part 2 - writing CPython extensions using Python/C API](/python-interop-capi)
* Part 3 - Deep dive into ctypes module in CPython
