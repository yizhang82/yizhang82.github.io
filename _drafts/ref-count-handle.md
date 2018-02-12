
Last time we talked about dependent handles and I promised we'll take a look at ref-counted handles. 

A ref-counted handle is a special handle that will become either strong or weak depending on the ref count. It's only used in COM interop today internally in the CLR. 

You can find its definition in [gcinterface.h](https://github.com/dotnet/coreclr/blob/dev/release/2.0.0/src/gc/gcinterface.h#L311-L321)

```c++
    /*
     * REFCOUNTED HANDLES
     *
     * Refcounted handles are handles that behave as strong handles while the
     * refcount on them is greater than 0 and behave as weak handles otherwise.
     *
     * N.B. These are currently NOT general purpose.
     *      The implementation is tied to COM Interop.
     *
     */
    HNDTYPE_REFCOUNTED   = 5,
```

A bit of background before we dive deeper into the details:

COM ref counts is a counter tracking usage counts of each COM object. If it is more than 0, the COM object is alive and can be access. If it ever drops to 0, the COM object deletes itself. Every COM interface has defined AddRef/Release methods to manipulate ref count on the object. If you want to use a COM object, call AddRef to increase its ref count. When you are done, call Release to drop the ref count you "obtained". 

Why COM decides to use ref counts? It's a straight-forward (if a bit verbose and tedious) protocol to support sharing objects between different components. Explicit free requires knowing exactly when an object is not not being used and that is not possible in a shared environment without special knowledge of the object. You could also build a GC, but it's challenging to build a GC across multiple languages, and arguably ref-counting is a simple form of GC as well.

In COM interop, CLR needs to expose managed objects as COM objects, and naturally those needs to obey COM lifetime semantics as well, meaning it needs to maintain its own ref count, and be alive if its ref count is more than 0, and allow itself to be collected by GC if ref count drops to 0. Obviously if ref count drops to 0, but there are still other managed objects pointing to this object, it will still be alive. 

A ref-counted handle does exactly that: 
* If ref-count is > 0, ref-counted handle becomes a strong handle
* If ref-count is 0, it becomes a weak handle

(You'll see later the above is not technically accurate - but this is good enough for now)

Whenever CLR passes a managed object to native as COM object, it'll create a [CCW - Com Callable Wrapper] (https://docs.microsoft.com/en-us/dotnet/framework/interop/com-callable-wrapper) which has a ref-counted handle pointing to the underlying managed object. In CLR source code, a CCW is implemented using a link list of ComCallWrapper and SimpleComCallableWrapper.

Let's take a look at how GC sees the ref-counted handle:

[ObjectHandle.cpp](https://github.com/dotnet/coreclr/blob/dev/release/2.0.0/src/gc/objecthandle.cpp#L77-L113)

```c++
/*
 * Scan callback for tracing ref-counted handles.
 *
 * This callback is called to trace individual objects referred to by handles
 * in the refcounted table.
 */
void CALLBACK PromoteRefCounted(_UNCHECKED_OBJECTREF *pObjRef, uintptr_t *pExtraInfo, uintptr_t lp1, uintptr_t lp2)
{
    WRAPPER_NO_CONTRACT;
    UNREFERENCED_PARAMETER(pExtraInfo);

    // there are too many races when asychnronously scanning ref-counted handles so we no longer support it
    _ASSERTE(!((ScanContext*)lp1)->concurrent);

    LOG((LF_GC, LL_INFO1000, LOG_HANDLE_OBJECT_CLASS("", pObjRef, "causes promotion of ", *pObjRef)));

    Object *pObj = VolatileLoad((PTR_Object*)pObjRef);

#ifdef _DEBUG
    Object *pOldObj = pObj;
#endif

    if (!HndIsNullOrDestroyedHandle(pObj) && !g_theGCHeap->IsPromoted(pObj))
    {
        if (GCToEEInterface::RefCountedHandleCallbacks(pObj))
        {
            _ASSERTE(lp2);
            promote_func* callback = (promote_func*) lp2;
            callback(&pObj, (ScanContext *)lp1, 0);
        }
    }
    
    // Assert this object wasn't relocated since we are passing a temporary object's address.
    _ASSERTE(pOldObj == pObj);
}
```

It simply asks "are you alive" through `RefCountedHandleCallbacks`. This function is poorly named in my opinion, for two reasons:
* It returns a bool which asks the question "are you alive" - so `IsRefCountedObjectAlive` is a better name
* It only calls for one object, so the 'callbacks' is a misnomer.

Now you see what I meant earlier. A ref-counted handle really doesn't track ref counts - it only ask the target object "are you alive"? And the ref count is simply detail being tracked by the object itself, not a property of the ref-counted handle.

Anyway, this function simply calls into internal ComCallWrapper code to retrieve the corresponding ComCallWrapper. 
I'm not going to cover ComCallWrapper layout in this post - I've wrote a chapter about it in [Book of the runtime](https://github.com/dotnet/coreclr/blob/master/Documentation/botr/README.md) probably about 10 years ago. Unfortunately it is not open sourced yet - probably because cross-platform applications doesn't have a signifcant usage for COM interop (but just using very basic COM could become a very viable ABI for writing components - probably deserve another post later). For now, just tink that `GetWrapperForObject` go through a magic data structure called `SyncBlock` and retrieves the corresponding `ComCallWrapper` instance from there - it's tied to the object. Then it calls `IsWrapperActive`:

```c++
bool GCToEEInterface::RefCountedHandleCallbacks(Object * pObject)
{
    CONTRACTL
    {
        NOTHROW;
        GC_NOTRIGGER;
    }
    CONTRACTL_END;

#ifdef FEATURE_COMINTEROP
    //<REVISIT_TODO>@todo optimize the access to the ref-count
    ComCallWrapper* pWrap = ComCallWrapper::GetWrapperForObject((OBJECTREF)pObject);
    _ASSERTE(pWrap != NULL);

    return !!pWrap->IsWrapperActive();
#else
    return false;
#endif
}
```

There are quite a bit of checks going on in `IsWrapperActive`. Many of the complications coming from having to support WinRT & XAML and resolving native/managed cycles (which I might cover in a separate post). For the purpose of this post, I've simplified it and cut out the unrelated stuff:

[ComCallableWrapper.h](https://github.com/dotnet/coreclr/blob/dev/release/2.0.0/src/vm/comcallablewrapper.h#L2645-L2680)

```c++
inline BOOL ComCallWrapper::IsWrapperActive()
{
    // Since its called by GCPromote, we assume that this is the start wrapper

    LONGLONG llRefCount = m_pSimpleWrapper->GetRealRefCount();
    ULONG cbRef = GET_COM_REF(llRefCount);

    BOOL bHasStrongCOMRefCount = (cbRef > 0);

    BOOL bIsWrapperActive = bHasStrongCOMRefCount;

    LOG((LF_INTEROP, LL_INFO1000, 
         "CCW 0x%p: cbRef = 0x%x, cbJupiterRef = 0x%x, IsPegged = %d, GlobalPegging = %d, IsHandleWeak = %d\n", 
         this, 
         cbRef, cbJupiterRef, IsPegged(), RCWWalker::IsGlobalPeggingOn(), IsHandleWeak()));
    LOG((LF_INTEROP, LL_INFO1000, "CCW 0x%p: IsWrapperActive returned %d\n", this, bIsWrapperActive));
    
    return bIsWrapperActive;    
}  
```

It basically returns true if COM ref > 0, and false otherwise. If you got a CCW in native code, calling `AddRef`/`Release` will change the ref count.

To summerize, a ref-counted handle is a handle that ask its target object whether it is alive, and changes to strong handle if the answer is yes, and otherwise become a weak handle. The target object is always a object that has an associated CCW, and it knows how to answer that question depending on its internal flags, mostly the ref count.

## Why is this not (yet) exposed

It should be obvious by now that ref-counted handle is hard coded to CCWs - it knows exactly the data structure associated and calls a internal implementation to return whether the handle to the object is strong or weak. 

One can imagine this could be exposed as a general mechanism - and GC can ask the handle whether it is alive or weak.

This can be designed in a few different ways:
1. The handle maintains a boolean
2. The handle maintain its own ref-count
3. The handle has a callback and GC makes a callback

At a first glance go with #3 seems the most flexible. Unfortunately it has a few problems:
* The callback could take arbitary time and could even deadlock - in this case what you'll see is that GC taking long time or don't ever finish. If there are a lot of such objects, the GC team could get a lot of calls from angry customers.
* Writing the callback is also quite challenging. Imagine if you try to allocate an object in the callback (which is not a outragous idea), and that object triggers a GC, now you've got yourself a deadlock because GC is running! You might make the deadlock case a no-op, but that breaks the invariant of GC and presents a much bigger problem.

Go with #1/#2 is probably more reasonable. The handle just needs to maintain a separate ref-count or a boolean, and that gets updated by other code as needed. Unfortunately this can't be generalized to be used by CCW as it actually needs to run some code. In the code I've shown you earlier, it does more than just looking at a ref-count, and it looks at some internal data structure that only updated in GC as well (for resolving native/managed cycles). So this effectively means that the existing ref-count handle can't be exposed as-is. This is probably why it is not exposed at all - there needs to be people asking for this feature and this needs to be done as a new feature with its own design and scenario.

