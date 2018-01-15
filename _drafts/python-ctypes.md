
# Python/C API

* Pay attention to x64/x86 build in CMake - need to match exactly

`-DCMAKE_GENERATOR_PLATFORM=x64`

`pyconfig.h`

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

`MS_NO_COREDLL`


```
main.obj : error LNK2019: unresolved external symbol Py_InitModule4TraceRefs_64 referenced in function initFastInt
```

```
#ifdef _DEBUG
#	define Py_DEBUG
#endif
```

```c
#ifdef Py_TRACE_REFS
 /* When we are tracing reference counts, rename Py_InitModule4 so
    modules compiled with incompatible settings will generate a
    link-time error. */
 #if SIZEOF_SIZE_T != SIZEOF_INT
 #undef Py_InitModule4
 #define Py_InitModule4 Py_InitModule4TraceRefs_64
 #else
 #define Py_InitModule4 Py_InitModule4TraceRefs
 #endif
#endif
```

C:\python27\libs\python27.lib
```
Py_InitModule4_64   
```

So when you build you need to specify release. For example, `msbuild /p:Configuration=Release`.

Mac

sys.path.append('/Users/yizhang/github/bindings_example/python/fastint/out/')


## Deep Dive

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

cdll, pydll, windll, oledll are simply instances of LibraryLoader class.

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

the attribute access are defined as __getattr__:

https://github.com/python/cpython/blob/3.6/Lib/ctypes/__init__.py#L358

```python
    def __getattr__(self, name):
        if name.startswith('__') and name.endswith('__'):
            raise AttributeError(name)
        func = self.__getitem__(name)
        setattr(self, name, func)
        return func
```

The difference between OleDll and WinDll is simply the default settings:

For CDll:

```py
class CDLL(object):
    _func_flags_ = _FUNCFLAG_CDECL
    _func_restype_ = c_int
```

WinDLl has StdCall as default calling convention:

```python
    class WinDLL(CDLL):
        _func_flags_ = _FUNCFLAG_STDCALL
```

OleDll is like WinDll (in terms of calling convention), but the default return type is also HRESULT.

```python
    class OleDLL(CDLL):
        _func_flags_ = _FUNCFLAG_STDCALL
        _func_restype_ = HRESULT
```

Functions are presented as CFuncPtr in _ctypes module:

https://github.com/python/cpython/blob/3.6/Modules/_ctypes/_ctypes.c#L5426

Gets registered here:

https://github.com/python/cpython/blob/3.6/Modules/_ctypes/_ctypes.c#L5539

```py

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

>>> from _ctypes import *
>>> CFuncPtr
<type '_ctypes.PyCFuncPtr'>
>>> print vars(CFuncPtr)
{'errcheck': <attribute 'errcheck' of '_ctypes.PyCFuncPtr' objects>, '__nonzero__': <slot wrapper '__nonzero__' of '_ctypes.PyCFuncPtr' objects>, '__new__': <built-in method __new__ of _ctypes.PyCFuncPtrType object at 0x00000000596FCA30>, 'restype': <attribute 'restype' of '_ctypes.PyCFuncPtr' objects>, 'argtypes': <attribute 'argtypes' of '_ctypes.PyCFuncPtr' objects>, '__repr__': <slot wrapper '__repr__' of '_ctypes.PyCFuncPtr' objects>, '__call__': <slot wrapper '__call__' of '_ctypes.PyCFuncPtr' objects>, '__doc__': 'Function Pointer'}


```cpp
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
```

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
