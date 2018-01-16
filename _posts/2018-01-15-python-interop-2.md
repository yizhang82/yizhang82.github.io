---
layout: post
title:  "Calling C functions from Python - part 2 - writing CPython extensions using Python/C API"
date:   2018-01-15
description: Calling C functions from Python - part 2 - writing CPython extensions using Python/C API
permalink: python-interop-capi
comments: true
categories:
- python
- cpython
- interop
- extensions
---

In my [previous post](http://yizhang82.me/python-interop-ctypes) we've briefly looked at using ctypes module to call C APIs. In this post let's dive into a completely different approach - writing a C extension using Python/C API. From the C extension you can then call whatever C/C++ code you want. This is a pretty popular approach to expose a 3rd party C library as python module. The downside is this module would only be loaded by CPython, which is usually not a big issue - unless you use other Python implementation like [PyPy](http://pypy.org/).

Imagine if we want to build a better integer library supporting faster integer operations. In this example it won't be really faster - just a hypothetical example :)

# It's all C code

CPython, as the name suggests, is written in C (mostly). It has a set of data types describes what are python objects, defines a set of operations on python objects, and use those definition + operations to implement core language functionality and internal modules. A subset of those APIs are opened for extension module writers to access the interpreter directly, pretty much like internal modules. Not surprisingly, this is extremely powerful - you have almost the same power as the interpreter itself. 

Unfortunately, this also means:

* the extension module is bound to CPython. In theory another Python implementation could implement the entire CPython API surface area - but that effectively means that you are rewriting a significant part of CPython from scratch with the same interface, implementing it with your own Python implementation - a daunting (if not challenging) task for sure. 

* CPython always needs to implement those APIs which means that overhauling the interpreter is now more difficult and needs to happen incrementally while maintaining compatibility of the C API.

# A module with only static methods

Let's jump right in. Any Python/C extension module needs to start by including `python.h` to get all the definitions of Python/C API and types. Don't worry about details of building yet - we'll get to that later.

```c
#include <Python.h>
```

Now we need to define what the static method looks like:

```c
static PyMethodDef FastIntModule_StaticMethods[] = {
    { "add", FastInt_Add, METH_VARARGS, "Add two integers" },
    { NULL, NULL, 0, NULL }
};
```

`PyMethodDef` is the C struct type describing python methods. You need to supply:
* the name - "add"
* the actual C function implementation - `FastInt_Add`. We'll fill it in later.
* flags - `METH_VARARGS` meaning it accepts arbitary number of arguments via tuples
* doc - "Add two integers"

The last one with all NULLs is a sentinel tell Python to stop looking at more entries, kinda like a `\0` terminator. It's a convention that you'll need to remember. This way you don't have to pass size around. 

Now we need to tell Python that we have a module with these static functions:

```c
PYMODINIT_FUNC initfastint()
{
    Py_InitModule("fastint", FastIntModule_StaticMethods);
}
```

All python initialization module functions need to be named `init<module_name>` - this is how python knows which function to call in your extension module. All it needs to do right now is to register the module with the list of static methods you supplied. 

With all the setup, now all we need to do is to add the real method:

```c
static PyObject *FastInt_Add(PyObject *self, PyObject *args)
{
    int a, b;
    if (!PyArg_ParseTuple(args, "ii", &a, &b))
    {
        return NULL;
    }

    return Py_BuildValue("i", a + b);
}
```

There are quite a few things here and can look a bit scary first time. Let's go through this one thing at a time.

First, all Python objects are `PyObject*`. 

You can think this as the "base class pointer" as every python object are "derived" from PyObject. The code is written using C so the inheritance is really built by hand through inserting a PyObject field into all the subclasses. We'll see more of that later.

A `PyObject` is really a ref count + its type.

```
typedef struct _object {
    _PyObject_HEAD_EXTRA
    Py_ssize_t ob_refcnt;
    struct _typeobject *ob_type;
} PyObject;
``` 

Then, in `FastInt_Add`, it accepts `self` and rest of the arguments in `args` as a tuple. `PyArg_ParseTuple` is used to parse the arguments and break them down into dividual local variables, using a printf/scanf style format - `ii` means following two pointers are int*. The result is added together, and then returned in the same manner constructing a Python integer object.

That's it! 

# Buliding the module

In this case I'm using CMake. You can use whatever you want but CMake makes it pretty easy to build it in multiple platforms.

First, you need to let CMakfind_package(PythonLibs 2.7 REQUIRED)e find the python package:

```
find_package(PythonLibs 2.7 REQUIRED)
```

This sets necessary `PYTHON_INCLUDE_DIRS` and `PYTHON_LIBRARIES` variables that you can use later.

One interesting problem you might run into is that you need to have a matching bitness of python with your build. For example, if you are building x86 and yet your python is 64-bit, you may see a package lookup failure. Try adding 
`-DCMAKE_GENERATOR_PLATFORM=x64` to building as 64-bit instead.

```
include_directories(${PYTHON_INCLUDE_DIRS})target_link_libraries(FASTINT_DLL ${PYTHON_LIBRARIES})
```

To build your code as a python extension module, it obviously needs to be a shared library (`DLL`/`dylib`/`so`), and should have the extension `.pyd`:

```
add_library(FASTINT_DLL SHARED main.c)
set_target_properties(FASTINT_DLL PROPERTIES SUFFIX ".pyd")
```

One interesting problem that I ran into in Windows 64-bit python 2.7 is that Python.h tries to redirect your lib to the debug lib python27_d.lib which doesn't really exist in python distribution by default unless you build your own debug python. This is done in `pyconfig.h`:

```c
/* For an MSVC DLL, we can nominate the .lib files used by extensions */
#ifdef MS_COREDLL
#	ifndef Py_BUILD_CORE /* not building the core - must be an ext */
#		if defined(_MSC_VER)
			/* So MSVC users need not specify the .lib file in
			their Makefile (other compilers are generally
			taken care of by distutils.) */
#			ifdef _DEBUG
#				pragma comment(lib,"python27_d.lib")
#			else
#				pragma comment(lib,"python27.lib")
#			endif /* _DEBUG */
#		endif /* _MSC_VER */
#	endif /* Py_BUILD_CORE */
#endif /* MS_COREDLL */
```

This is unnecessary in my opinion as it should be perfectly OK to build your extension as debug and use Python/C API as release. I tried to use some knobs such as `MS_COREDLL` but having _DEBUG flag ultimately force Python.h go down the path of linking against debug version of API:

```
main.obj : error LNK2019: unresolved external symbol Py_InitModule4TraceRefs_64 referenced in function initFastInt
```

Turns out `Py_InitModule4TraceRefs_64` only exists in debug libs.

The simpliest thing to do is to stick with release build - and use debug build of Python if you want to build your extension as debug. In my opinion this is not designed properly - _DEBUG should control debug-ness of the module and python itself should use a different one, but this is probably topic for another day.

# Trying it out

Once we build the module using cmake, we can finally give this a try:

```py
>>> import fastint
>>> fastint.add(10, 20)
30
```

If Python refuse to load the module, you might need to tweak `syspath`, such as:

```py
sys.path.append('path/to/my/module')
```

Or, load it directly:

```py
fastint = imp.load_dynamic('fastint', r'path/to/my/module/fastint.pyd')
```

# Defining a fastint class

If we want to define a fastint type, it is a bit more involved.

Let's start by defining our own PyObject "subclass":

```c
typedef struct {
    PyObject_HEAD
    int value;
} FastIntObject;
```

Recall our earlier discussion on `PyObject` "manual" inheritance - `PyObject_HEAD` is the magic that inserts the `PyObject` fields:

```c
#define PyObject_HEAD                   \
    _PyObject_HEAD_EXTRA                \
    Py_ssize_t ob_refcnt;               \
    struct _typeobject *ob_type;
```

And all what we need in addition to that is a int field.

Once we have the object definition, let's define the type:

```c
static PyTypeObject FastIntType = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "fastint.fastInt",         /* tp_name */
    sizeof(FastIntObject),     /* tp_basicsize */
    0,                         /* tp_itemsize */
    0,                         /* tp_dealloc */
    0,                         /* tp_print */
    0,                         /* tp_getattr */
    0,                         /* tp_setattr */
    0,                         /* tp_reserved */
    0,                         /* tp_repr */
    0,                         /* tp_as_number */
    0,                         /* tp_as_sequence */
    0,                         /* tp_as_mapping */
    0,                         /* tp_hash  */
    0,                         /* tp_call */
    0,                         /* tp_str */
    0,                         /* tp_getattro */
    0,                         /* tp_setattro */
    0,                         /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT,        /* tp_flags */
    "Fast int object",         /* tp_doc */    
    0,                         /* tp_traverse */
    0,                         /* tp_clear */
    0,                         /* tp_richcompare */
    0,                         /* tp_weaklistoffset */
    0,                         /* tp_iter */
    0,                         /* tp_iternext */
    FastInt_methods,           /* tp_methods */
    FastInt_members,           /* tp_members */
    0,                         /* tp_getset */
    0,                         /* tp_base */
    0,                         /* tp_dict */
    0,                         /* tp_descr_get */
    0,                         /* tp_descr_set */
    0,                         /* tp_dictoffset */
    (initproc)FastInt_init,    /* tp_init */
    0,                         /* tp_alloc */
    FastInt_new,               /* tp_new */
};
```

Although this looks rather intimidating at first, this is simply a struct with a bunch of fields that defines what this type is. This defines a type object - an object that represents the fastint type.

## Every field is a well-defined operation

Every single field here is a well-defined operation understood by the interpreter. For example, `tp_alloc` is for memory allocation, and `tp_new` and `tp_init` is for object initialization (including initialization for its fields). If you are familiar with COM or C++, you'll quickly notice that this is simply a v-table with function pointers. By providing field values, you are effectively *overriding* the base implementation. Oh, where is the actual inheritance, you say? It is handled by `PyType_Ready` helper - we need to call `PyType_Ready` to fill in the blanks - initializing fields from base type.


```c
    if (PyType_Ready(&FastIntType) < 0)
        return;
```

## FastIntType itself is an PyObject

Take a look at the `PyVarObject_HEAD_INIT` macro that initializes PyObject's fields:

```c
#define PyObject_HEAD_INIT(type)        \
    _PyObject_EXTRA_INIT                \
    1, type,

#define PyVarObject_HEAD_INIT(type, size)       \
    PyObject_HEAD_INIT(type) size,
```

As you can see above, it is giving a 1 ref count and NULL type (which we'll fill in later). All Python objects are ref-counted and as a extension writer we need to maintain ref count correctly. A new object starts with 1, not surprisingly.

> In theory CPython could be designed with a garbage collector and avoid ref counting. There are quite a few challenges implementing a real garbage collector, such as reducing stop-othe-world collections, fine-tune memory growth policy, knowing where stack and static objects are at all times, avoiding fragmentation, finding the right balance between keeping objects alive vs reclaiming objects, etc. At the end of the day, implementing ref counting is the simplest thing to do, and it stuck. In practice it works usually pretty well, except for cycles (and the perf cost of ref-counting). Python does have a cycle detection algorithm and `tp_traverse` to help with pointer traversal, but it's optional.

## `tp_new` field defines the new function

```c
static PyObject *
FastInt_new(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    FastIntObject *self;

    self = (FastIntObject *)type->tp_alloc(type, 0);
    if (self != NULL) {
        self->value = 0;
    }

    return (PyObject *)self;
}
```

The new function does the allocation and minimum initialization. Conveniently, we'll use the type object of fastint type to allocate a type object, using the `tp_alloc` helper. As mentioned previously, `tp_alloc` wasn't provided by us but rather filled-in by `PyType_Ready`, kinda like calling the base constructor.

Note that we also has a init function:

```c
static int
FastInt_init(FastIntObject *self, PyObject *args, PyObject *kwds)
{
    if (! PyArg_ParseTuple(args, "i", &self->value))
        return -1;

    return 0;
}
```

It calls `PyArg_ParseTuple` to assign the internal value with the supplied int argument. Intuitively, you might think `tp_init` is the `__init__` function and `tp_new` is the `__new__` function, and you are right. `__new__` is the creation method while `__init__` is the initialization method.

## `tp_methods` define list of methods

We only have one:

```c
static PyMethodDef FastInt_methods[] = {
    { "inc", (PyCFunction) FastInt_inc, METH_VARARGS, "inc method" },
    { NULL }
};
```

Again, NULLs are the sentinel.

The inc method looks like this - and is pretty straight-forward:

```c
static PyObject *
FastInt_inc(FastIntObject *self, PyObject *args)
{
    int operand;
    if (! PyArg_ParseTuple(args, "i", &operand))
        return NULL;

    self->value += operand;

    Py_INCREF(self);
    return (PyObject *)self;
}
```

Note that it returns `self` back to the caller. In Python, returning a object needs to come with an add ref (just like COM). So we need to call Py_INCREF. If you think about it, there is a good reason for it - the caller needs to be sure that the returned object is usable (otherwise the object could be gone after the return, or even before), and having a usable object meaning doing an explicit `Py_INCREF`. The caller can then use it knowing it is always safe, and release it by calling `Py_DECREF` when it's done. There are exceptions to this rule - if by certain implied contract that the caller knows the returned object is always going to be alive (usually tied to a *parent* object), it can return the object without a addref (one such example being `PyTuple_GetItem`). Always consult the documentation.

## tp_members define its members

We have one member - the value field:

```c
static PyMemberDef FastInt_members[] = {
    { "value", T_INT, offsetof(FastIntObject, value), 0, "value of the integer" },
    { NULL }  /* Sentinel */
};
```

We basically tell python - here is a field with this offset and you can show it as a member called "value". The struct field name can be whatever name you want since python doesn't care what you call your struct fields - meaning that they don't have to match, but it is nice that they do.

# Initializing the type

Now that we have the type with all its members, we need to tell Python that it is there. Not surprisingly, the best place to do so is the module init function:

```c
PYMODINIT_FUNC initfastint()
{
    PyObject *m;

    if (PyType_Ready(&FastIntType) < 0)
        return;

    m = Py_InitModule("fastint", FastIntModule_StaticMethods);
    if (m == NULL)
        return;

    Py_INCREF(&FastIntType);
    PyModule_AddObject(m, "fastInt", (PyObject *)&FastIntType);
}
```

* `PyType_Ready` initialize the type object by assigning its fields with base and other necessary adjustments and error checking
* `PyModule_AddObject` registers the type on the module so that Python knows this module now has this type.

# Trying out fastInt type

Now it's time to try out our new (not at all) fastint type.

```py
>>> import fastint
>>> i = fastint.fastInt(10)
>>> i.value
10
>>> i.inc(20)
<fastint.fastInt object at 0x0000000004A610D8>
>>> i.value
30
```

# Where is the code

You can find the code at [github](https://github.com/yizhang82/bindings_example/tree/master/python/fastint)

# What's next

As previously mentioned, I'll cover Python C API in the next post and dive into ctypes implementation in CPython (which are written using python C API).

I'll update them with links once they become available:

* [Part 1 - CTypes](yizhang82.me/python-interop-ctypes)
* [Part 2 - writing CPython extensions using Python/C API](yizhang82.me/python-interop-capi)
* Part 3 - Deep dive into ctypes module in CPython
