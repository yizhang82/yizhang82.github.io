
## Deep Dive

Last time we've looked at using ctypes to call C API, and writing extension module using Python/C API. Now we can finally tie these two together - looking at how ctypes is actually implemented using mix of Python/C API  and Python code.

You can find CPython source code [here](https://github.com/python/cpython).

ctypes C implementation is [here](https://github.com/python/cpython/tree/master/Modules/_ctypes) while the python implementation is [here](https://github.com/python/cpython/tree/master/Lib/ctypes).

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

Eventually it uses ffi_call from [FFI](https://sourceware.org/libffi/) to make the call. `FFI` itself is quite complicated - for now just think of it as a way of being able to say "I want to make a CDecl call to this function using these arguments", without worrying about all the details in the ABI (Application Binary Interface) level.

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

## Data types

```c
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

```py
union value {
                char c[16];
                short s;
                int i;
                long l;
                float f;
                double d;
                long long ll;
                long double D;
};
```



```c
static PyTypeObject Simple_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes._SimpleCData",
    sizeof(CDataObject),                        /* tp_basicsize */
    0,                                          /* tp_itemsize */
    0,                                          /* tp_dealloc */
    0,                                          /* tp_print */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_reserved */
    (reprfunc)&Simple_repr,                     /* tp_repr */
    &Simple_as_number,                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */
    0,                                          /* tp_getattro */
    0,                                          /* tp_setattro */
    &PyCData_as_buffer,                         /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE, /* tp_flags */
    "XXX to be provided",                       /* tp_doc */
    (traverseproc)PyCData_traverse,             /* tp_traverse */
    (inquiry)PyCData_clear,                     /* tp_clear */
    0,                                          /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    Simple_methods,                             /* tp_methods */
    0,                                          /* tp_members */
    Simple_getsets,                             /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    0,                                          /* tp_dictoffset */
    (initproc)Simple_init,                      /* tp_init */
    0,                                          /* tp_alloc */
    GenericPyCData_new,                         /* tp_new */
    0,                                          /* tp_free */
};
```

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

All the simple data types are sub classes:

```py
class py_object(_SimpleCData):
    _type_ = "O"
    def __repr__(self):
        try:
            return super().__repr__()
        except ValueError:
            return "%s(<NULL>)" % type(self).__name__
_check_size(py_object, "P")

class c_short(_SimpleCData):
    _type_ = "h"
_check_size(c_short)

class c_ushort(_SimpleCData):
    _type_ = "H"
_check_size(c_ushort)

class c_long(_SimpleCData):
    _type_ = "l"
_check_size(c_long)

class c_ulong(_SimpleCData):
    _type_ = "L"
_check_size(c_ulong)
```

All these are maintained internally in a table mapped to its accessor and ffi type:

```c
static struct fielddesc formattable[] = {
    { 's', s_set, s_get, &ffi_type_pointer},
    { 'b', b_set, b_get, &ffi_type_schar},
    { 'B', B_set, B_get, &ffi_type_uchar},
    { 'c', c_set, c_get, &ffi_type_schar},
    { 'd', d_set, d_get, &ffi_type_double, d_set_sw, d_get_sw},
    { 'g', g_set, g_get, &ffi_type_longdouble},
    { 'f', f_set, f_get, &ffi_type_float, f_set_sw, f_get_sw},
    { 'h', h_set, h_get, &ffi_type_sshort, h_set_sw, h_get_sw},
    { 'H', H_set, H_get, &ffi_type_ushort, H_set_sw, H_get_sw},
    { 'i', i_set, i_get, &ffi_type_sint, i_set_sw, i_get_sw},
    { 'I', I_set, I_get, &ffi_type_uint, I_set_sw, I_get_sw},
/* XXX Hm, sizeof(int) == sizeof(long) doesn't hold on every platform */
/* As soon as we can get rid of the type codes, this is no longer a problem */
#if SIZEOF_LONG == 4
    { 'l', l_set, l_get, &ffi_type_sint32, l_set_sw, l_get_sw},
    { 'L', L_set, L_get, &ffi_type_uint32, L_set_sw, L_get_sw},
#elif SIZEOF_LONG == 8
    { 'l', l_set, l_get, &ffi_type_sint64, l_set_sw, l_get_sw},
    { 'L', L_set, L_get, &ffi_type_uint64, L_set_sw, L_get_sw},
#else
# error
#endif
#if SIZEOF_LONG_LONG == 8
    { 'q', q_set, q_get, &ffi_type_sint64, q_set_sw, q_get_sw},
    { 'Q', Q_set, Q_get, &ffi_type_uint64, Q_set_sw, Q_get_sw},
#else
# error
#endif
    { 'P', P_set, P_get, &ffi_type_pointer},
    { 'z', z_set, z_get, &ffi_type_pointer},
#ifdef CTYPES_UNICODE
    { 'u', u_set, u_get, NULL}, /* ffi_type set later */
    { 'U', U_set, U_get, &ffi_type_pointer},
    { 'Z', Z_set, Z_get, &ffi_type_pointer},
#endif
#ifdef MS_WIN32
    { 'X', BSTR_set, BSTR_get, &ffi_type_pointer},
    { 'v', vBOOL_set, vBOOL_get, &ffi_type_sshort},
#endif
#if SIZEOF__BOOL == 1
    { '?', bool_set, bool_get, &ffi_type_uchar}, /* Also fallback for no native _Bool support */
#elif SIZEOF__BOOL == SIZEOF_SHORT
    { '?', bool_set, bool_get, &ffi_type_ushort},
#elif SIZEOF__BOOL == SIZEOF_INT
    { '?', bool_set, bool_get, &ffi_type_uint, I_set_sw, I_get_sw},
#elif SIZEOF__BOOL == SIZEOF_LONG
    { '?', bool_set, bool_get, &ffi_type_ulong, L_set_sw, L_get_sw},
#elif SIZEOF__BOOL == SIZEOF_LONG_LONG
    { '?', bool_set, bool_get, &ffi_type_ulong, Q_set_sw, Q_get_sw},
#endif /* SIZEOF__BOOL */
    { 'O', O_set, O_get, &ffi_type_pointer},
    { 0, NULL, NULL, NULL},
};
```

As an example - lset reads value as a long and memcpy to the target buffer (_SimpleData)

```c
static PyObject *
l_set(void *ptr, PyObject *value, Py_ssize_t size)
{
    long val;
    long x;
    if (get_long(value, &val) < 0)
        return NULL;
    memcpy(&x, ptr, sizeof(x));
    x = SET(long, x, val, size);
    memcpy(ptr, &x, sizeof(x));
    _RET(value);
}
```

For structs,

```c
PyTypeObject PyCStructType_Type = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_ctypes.PyCStructType",                            /* tp_name */
    0,                                          /* tp_basicsize */
    0,                                          /* tp_itemsize */
    0,                                          /* tp_dealloc */
    0,                                          /* tp_print */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_reserved */
    0,                                          /* tp_repr */
    0,                                          /* tp_as_number */
    &CDataType_as_sequence,                     /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */
    0,                                          /* tp_getattro */
    PyCStructType_setattro,                     /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC, /* tp_flags */
    "metatype for the CData Objects",           /* tp_doc */
    (traverseproc)CDataType_traverse,           /* tp_traverse */
    (inquiry)CDataType_clear,                   /* tp_clear */
    0,                                          /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    CDataType_methods,                          /* tp_methods */
    0,                                          /* tp_members */
    0,                                          /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    0,                                          /* tp_dictoffset */
    0,                                          /* tp_init */
    0,                                          /* tp_alloc */
    PyCStructType_new,                                  /* tp_new */
    0,                                          /* tp_free */
};
```

setattro catch the `_field_` access and update the internal dictionary:

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

```c++
extern "C" {
    __declspec(dllexport) int Print(const char *msg)
    {
        cout << msg;

        return 0;
    }
}
```


## Next in the series 

I'll update them with links once they become available: 

- Part 1 - CTypes
- Part 2 - Using Python C API (CPython only)
- Part 3 - Deep dive into ctypes module in CPython
