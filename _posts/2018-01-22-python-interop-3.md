---
layout: post
title:  "Calling C functions from Python - part 3 - deep dive into ctypes implementation in CPython"
date:   2018-01-22
description: Calling C functions from Python - part 3 - deep dive into ctypes implementation in CPython
permalink: python-interop-inside-ctypes
comments: true
excerpt_separator: <!--more-->
categories:
- python
- interop
- ctypes
- cpython
- vm
- runtime
---

Last time we've looked at using ctypes to call C API, and writing extension module using Python/C API. Now we can finally tie these two together - looking at how ctypes is actually implemented using mix of Python/C API  and Python code.

* You can find CPython source code [here](https://github.com/python/cpython).
* ctypes' C implementation is [here](https://github.com/python/cpython/tree/master/Modules/_ctypes) 
* ctypes' python implementation is [here](https://github.com/python/cpython/tree/master/Lib/ctypes).

<!--more-->

## Loading libraries

Recall that in `ctypes` we have `cdll`, `windll`, `oledll` object to help loading libraries. They are really LibraryLoader objects:

```py
>>> print ctypes.cdll
<ctypes.LibraryLoader object at 0x000000000592F470>
```

And that type is just plain python code:

```py
class LibraryLoader(object):
    def __init__(self, dlltype):
        self._dlltype = dlltype

    def __getattr__(self, name):
        if name[0] == '_':
            raise AttributeError(name)
        dll = self._dlltype(name)
        setattr(self, name, dll)
        return dll

    def __getitem__(self, name):
        return getattr(self, name)

    def LoadLibrary(self, name):
        return self._dlltype(name)
```

The `__getattr__` is the magic that implements attribute-based library loading. Note that if the attribute is already there, CPython returns that attribute immediately without calling `__getattr__`. Otherwise you would end up with multiple copies of the same attribute, or keeping creating new library objects and discarding old ones - not very efficent.

`dlltype` is the type for each kind of DLL, such as `CDLL`, `PyDll`, `WinDll`, `OleDll`. `__getattr__` creates new instances of these types as needed. 

`cdll`, `pydll`, `windll`, `oledll` are simply instances of `LibraryLoader` class, which are created with corresponding dlltype.

```py
cdll = LibraryLoader(CDLL)
pydll = LibraryLoader(PyDLL)

if _os.name == "nt":
    pythonapi = PyDLL("python dll", None, _sys.dllhandle)
elif _sys.platform == "cygwin":
    pythonapi = PyDLL("libpython%d.%d.dll" % _sys.version_info[:2])
else:
    pythonapi = PyDLL(None)

if _os.name == "nt":
    windll = LibraryLoader(WinDLL)
    oledll = LibraryLoader(OleDLL)
```

Let's look at `CDLL` first - its init does a `dlopen` to load the library:

```py
class CDLL(object):
    def __init__(self, name, mode=DEFAULT_MODE, handle=None,
        if handle is None:
            self._handle = _dlopen(self._name, mode)
        else:
            self._handle = handle
```

The attribute access are defined in `__getattr__` as well - it gets translated to `__getitem__` call which creates a new `_FuncPtr` instance.

```py
    def __getattr__(self, name):
        if name.startswith('__') and name.endswith('__'):
            raise AttributeError(name)
        func = self.__getitem__(name)
        setattr(self, name, func)
        return func
    def __getitem__(self, name_or_ordinal):
        func = self._FuncPtr((name_or_ordinal, self))
        if not isinstance(name_or_ordinal, int):
            func.__name__ = name_or_ordinal
        return func
```

We'll look at `_FuncPtr` later - for now it's good enough to know it represents function pointer.

The difference between OleDll and WinDll is simply the default settings:

For `CDLL` - the base class:

```py
class CDLL(object):
    _func_flags_ = _FUNCFLAG_CDECL
    _func_restype_ = c_int
```

`WinDll` has `StdCall` as default calling convention, and deriving from `CDLL`:

```python
    class WinDLL(CDLL):
        _func_flags_ = _FUNCFLAG_STDCALL
```

`OleDll` is like `WinDll` (in terms of calling convention), but the default return type is `HRESULT`.

```python
    class OleDLL(CDLL):
        _func_flags_ = _FUNCFLAG_STDCALL
        _func_restype_ = HRESULT
```

## Calling the function

In last section we discussed the how library are loaded and we didn't talk about functions yet. 
Functions are presented as `_FuncPtr` which is basically a `_CFuncPtr` in _ctypes module:

```py
        class _FuncPtr(_CFuncPtr):
            _flags_ = flags
            _restype_ = self._func_restype_
```

Now it's type to put our Python/C API knowledge to good use - `_CFuncPtr` is implemented in C:

```c
PyTypeObject PyCFuncPtr_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes.PyCFuncPtr",
    sizeof(PyCFuncPtrObject),                           /* tp_basicsize */
    0,                                          /* tp_itemsize */
    (destructor)PyCFuncPtr_dealloc,             /* tp_dealloc */
    0,                                          /* tp_print */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_reserved */
    (reprfunc)PyCFuncPtr_repr,                  /* tp_repr */
    &PyCFuncPtr_as_number,                      /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    (ternaryfunc)PyCFuncPtr_call,               /* tp_call */
    0,                                          /* tp_str */
    0,                                          /* tp_getattro */
    0,                                          /* tp_setattro */
    &PyCData_as_buffer,                         /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE, /* tp_flags */
    "Function Pointer",                         /* tp_doc */
    (traverseproc)PyCFuncPtr_traverse,          /* tp_traverse */
    (inquiry)PyCFuncPtr_clear,                  /* tp_clear */
    0,                                          /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    0,                                          /* tp_methods */
    0,                                          /* tp_members */
    PyCFuncPtr_getsets,                         /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    0,                                          /* tp_dictoffset */
    0,                                          /* tp_init */
    0,                                          /* tp_alloc */
    PyCFuncPtr_new,                             /* tp_new */
    0,                                          /* tp_free */
}
```

Let's look at the `tp_new` function `PyCFuncPtr_new` first:

```c
PyCFuncPtr_new(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    // ...

    if (1 <= PyTuple_GET_SIZE(args) && PyTuple_Check(PyTuple_GET_ITEM(args, 0)))
        return PyCFuncPtr_FromDll(type, args, kwds);
```

PyCFuncPtr_FromDll has quite a bit of code, but in the end these two lines are the most important:

```c
static PyObject *
PyCFuncPtr_FromDll(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    // ...

#ifdef MS_WIN32
    address = FindAddress(handle, name, (PyObject *)type);
    // ...
#else
    address = (PPROC)ctypes_dlsym(handle, name);
    // ...
```

In Windows it does a `GetProcAddress` and in linux/mac it does `dlsym`.

As far as calling function goes, calling the `_CFuncPtr` effectively calls `tp_call` field which is `PyCFuncPtr_call`:

```c
static PyObject *
PyCFuncPtr_call(PyCFuncPtrObject *self, PyObject *inargs, PyObject *kwds)
{
    // ...
    callargs = _build_callargs(self, argtypes,
                               inargs, kwds,
                               &outmask, &inoutmask, &numretvals); 
    // ...
    result = _ctypes_callproc(pProc,
                       callargs,
#ifdef MS_WIN32
                       piunk,
                       self->iid,
#endif
                       dict->flags,
                       converters,
                       restype,
                       checker);
    // ...
    return _build_result(result, callargs,
                         outmask, inoutmask, numretvals);
}
```

There are a lot of code in the function above, but it basically does 3 steps - preparing the arguments, making the call, and building the result and propagating the arguments back (for out/inout parameters).

Eventually it uses ffi_call from [FFI](https://sourceware.org/libffi/) to make the call. 

```py
    if (FFI_OK != ffi_prep_cif(&cif,
                               cc,
                               argcount,
                               restype,
                               atypes)) {
        PyErr_SetString(PyExc_RuntimeError,
                        "ffi_prep_cif failed");
        return -1;
    }


    ffi_call(&cif, (void *)pProc, resmem, avalues);
```

`FFI` itself is quite complicated as it needs to understand all calling conventions and for different CPUs as well (for example, procedure calls in amd64 is drastically different in SPARC) - for now just think of it as a way of being able to say "I want to make a CDecl call to this function using these arguments", without worrying about all the details in the ABI (Application Binary Interface) level.

## Structs and metaclasses

Now that we've looked at library loading and function loading/calling, let's take a look at how structure is implemented. Recall how you write a structure:

```py
class VECTOR3(Structure):
    _fields_ = [("x", c_int), ("y", c_int), ("z", c_int)]
```

Somehow the VECTOR3 class gets the magic x, y, z attributes. How does this work?

The magic is in the `PyCStructType` metaclass.

> Metaclass is a type used to create other types - it is an alternative way of doing subclassing / inheritance in Python, and a very powerful one too. If you understand metaclass you understand Python's type system. If you are curious, see [Primer on metaclasses](https://jakevdp.github.io/blog/2012/12/01/a-primer-on-python-metaclasses/) on a excellent explanation on metaclasses and [Understanding Python Metaclasses](https://blog.ionelmc.ro/2015/02/09/understanding-python-metaclasses/) for a deeper dive. There is also a [presentation version](https://blog.ionelmc.ro/presentations/metaclase/) as well.

`ctypes.Structure` is implemented in `_ctypes` module as `Struct_Type`, and type of `Struct_Type` is `PyCStructType` (`PyCStructType_Type` object).

```c
    Py_TYPE(&Struct_Type) = &PyCStructType_Type;
    Struct_Type.tp_base = &PyCData_Type;
```

This makes PyCStructType` a *metaclass*.

Whenever you are deriving from `ctypes.Strucuture` like following:

```py
class VECTOR3(Structure):
    _fields_ = [("x", c_int), ("y", c_int), ("z", c_int)]
```

This effectively becomes:

```py
VECTOR3 = PyCStructType('VECTOR3', (Structure), { 'fields' : [("x", c_int), ("y", c_int), ("z", c_int)]
})
```

Note that `tp_new` of `PyCStructType_Type` is PyCStructType_new:

```c
PyTypeObject PyCStructType_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes.PyCStructType",                            /* tp_name */
    PyCStructType_setattro,                     /* tp_setattro */
    CDataType_methods,                          /* tp_methods */
    PyCStructType_new,                                  /* tp_new */
};
```

So this ends up calling PyCStructType_new with those arguments, which retrieves the `_fields_` from supplied dictionary, and assign it to `_fields_` attribute, triggering `PyCStructType_setattro`:

```c
static PyObject *
PyCStructType_new(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    return StructUnionType_new(type, args, kwds, 1);
}

static PyObject *
StructUnionType_new(PyTypeObject *type, PyObject *args, PyObject *kwds, int isStruct)
{
    PyTypeObject *result;
    PyObject *fields;
    StgDictObject *dict;

    result = (PyTypeObject *)PyType_Type.tp_new(type, args, kwds);
    //...
    PyDict_Update((PyObject *)dict, result->tp_dict));
    //...
    fields = PyDict_GetItemString((PyObject *)dict, "_fields_");
    //...
    fields = PyDict_GetItemString((PyObject *)dict, "_fields_");
    //...
    PyObject_SetAttrString((PyObject *)result, "_fields_", fields));
```

`tp_setattro` catch the `_field_` access (from `PyObject_SetAttrString` call) and update the internal dictionary on the newly created `VECTOR3` type:

```c
static int
PyCStructType_setattro(PyObject *self, PyObject *key, PyObject *value)
{
    /* XXX Should we disallow deleting _fields_? */
    if (-1 == PyType_Type.tp_setattro(self, key, value))
        return -1;

    if (value && PyUnicode_Check(key) &&
        _PyUnicode_EqualToASCIIString(key, "_fields_"))
        return PyCStructUnionType_update_stgdict(self, value, 1);
    return 0;
}
```

`PyCStructUnionType_update_stgdict` mostly traverse the list of fields and create necessary PyCField instances as corresponding attributes. Interestingly, the attribute assignment also triggers setattro, which simply let it through as it only cares about `_fields_` access (otherwise this would be an infinite loop). When you are accessing `myVector3.x`, you are setting/getting PyCField instance, which are descriptor classes that binds to the owner class, which is the structure itself. 

```c
PyTypeObject PyCField_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes.CField",                                   /* tp_name */
    sizeof(CFieldObject),                       /* tp_basicsize */
    (reprfunc)PyCField_repr,                            /* tp_repr */
    "Structure/Union member",                   /* tp_doc */
    (descrgetfunc)PyCField_get,                 /* tp_descr_get */
    (descrsetfunc)PyCField_set,                 /* tp_descr_set */
```

`PyCField_repr` provides the nice output you see here:

```py
>>> VECTOR3.x
<Field type=c_long, ofs=0, size=4>
```

While `PyCField_get`/`PyCField_set` provides access to the field on this structure (`myVector3.x`) through descriptor class and bindings to the structure instance:

```c
static int
PyCField_set(CFieldObject *self, PyObject *inst, PyObject *value)
{
    CDataObject *dst;
    char *ptr;
    if (!CDataObject_Check(inst)) {
        PyErr_SetString(PyExc_TypeError,
                        "not a ctype instance");
        return -1;
    }
    dst = (CDataObject *)inst;
    ptr = dst->b_ptr + self->offset;
    if (value == NULL) {
        PyErr_SetString(PyExc_TypeError,
                        "can't delete attribute");
        return -1;
    }
    return PyCData_set(inst, self->proto, self->setfunc, value,
                     self->index, self->size, ptr);
}
```

In the above function, `self` is the `PyCField` instance, `inst` is `VECTOR3` (or whatever structure you have), and `value` is the new value you are assigning with. Eventually it got set on the pointer to the structure + field offset, basically `*(ptr + offset) = value`.

But where is that ptr come from? 

`ctypes.Structure` are essentially CDataObject*:

```c
// Fields omitted for clarity 
static PyTypeObject Struct_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes.Structure",
    sizeof(CDataObject),                        /* tp_basicsize */
    GenericPyCData_new,                         /* tp_new */
};
```

A `CDataObject` looks like this:

```
struct tagCDataObject {
    PyObject_HEAD
    char *b_ptr;                /* pointer to memory block */
    int  b_needsfree;           /* need _we_ free the memory? */
    CDataObject *b_base;        /* pointer to base object or NULL */
    Py_ssize_t b_size;          /* size of memory block in bytes */
    Py_ssize_t b_length;        /* number of references we need */
    Py_ssize_t b_index;         /* index of this object into base's
                               b_object list */
    PyObject *b_objects;        /* dictionary of references we need to keep, or Py_None */
    union value b_value;
};
```

Just think of it as a generic holder of any value - like VARIANT (if COM is your thing). In particular, `b_value` field holds the well known simple data values (it's a union) and `b_ptr` points to the underlying data if it is a more complex type, like structures.

GenericPyCData_new is fairly straight-forward - it allocates enough memory as described by the internal `stgdict` dictionary, which you can treat it as physical layout information about its fields and total size, which is calculated when `_fields_` get assigned.

```c
static PyObject *
GenericPyCData_new(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    CDataObject *obj;
    StgDictObject *dict;

    dict = PyType_stgdict((PyObject *)type);
    if (!dict) {
        PyErr_SetString(PyExc_TypeError,
                        "abstract class");
        return NULL;
    }
    dict->flags |= DICTFLAG_FINAL;

    obj = (CDataObject *)type->tp_alloc(type, 0);
    if (!obj)
        return NULL;

    obj->b_base = NULL;
    obj->b_index = 0;
    obj->b_objects = NULL;
    obj->b_length = dict->length;

    if (-1 == PyCData_MallocBuffer(obj, dict)) {
        Py_DECREF(obj);
        return NULL;
    }
    return (PyObject *)obj;
}
```

PyCData_MallocBuffer handles two cases - if it is referring to a simple type (like `c_int`, etc), there is no need to allocate the int dynamically as it fits perfectly well in the `b_value` union field. Otherwise, it allocates the correct buffer size and assign to `b_ptr`.

```c
static int PyCData_MallocBuffer(CDataObject *obj, StgDictObject *dict)
{
    if ((size_t)dict->size <= sizeof(obj->b_value)) {
        /* No need to call malloc, can use the default buffer */
        obj->b_ptr = (char *)&obj->b_value;
        /* The b_needsfree flag does not mean that we actually did
           call PyMem_Malloc to allocate the memory block; instead it
           means we are the *owner* of the memory and are responsible
           for freeing resources associated with the memory.  This is
           also the reason that b_needsfree is exposed to Python.
         */
        obj->b_needsfree = 1;
    } else {
        /* In python 2.4, and ctypes 0.9.6, the malloc call took about
           33% of the creation time for c_int().
        */
        obj->b_ptr = (char *)PyMem_Malloc(dict->size);
        if (obj->b_ptr == NULL) {
            PyErr_NoMemory();
            return -1;
        }
        obj->b_needsfree = 1;
        memset(obj->b_ptr, 0, dict->size);
    }
    obj->b_size = dict->size;
    return 0;
}
```

You might already noticed that the buffer is 0 initialized, and gets freed when it gets finalized. The finalization happens in `PyCData_dealloc` which does a free if needed.

## Next in the series 

Originally I was planning to write 3 part series. But then I got interested in [PyPy](www.pypy.org) and decided to research into PyPy a bit more. In particular I suspect CFFI might have much better perf (at least in theory) than ctypes with a proper JIT implementation since the arguments "marshaling" can be pretty much "inlined", but that also requires JIT to be aware of various calling conventions, which is also a pretty daunting task as well (essentially implementing FFI in the JIT).

I'll update them with links once they become available:

* [Part 1 - CTypes](/python-interop-ctypes)
* [Part 2 - writing CPython extensions using Python/C API](/python-interop-capi)
* [Part 3 - Deep dive into ctypes implementation in CPython](/python-interop-inside-ctypes)
* Part 4 - PyPy and CFFI