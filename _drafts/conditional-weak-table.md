
# Secret .NET handles - DependentHandle, ConditionalWeakTable, and why it should be your go-to choice for cache

.NET publicly has documented 4 kind of handles:

1.Short Weak - Don't keep target object alive and will return null when object is gone or ready for finalization.

2.Long Weak - Don't keep target object alive and will return null when object is gone. It'll return the object when the object is being finalized.

3.Normal - keeps target object alive. If you are not careful, you may leak the object.

4.Pinned - Keeps the target object alive and prevents GC from moving this object around. Useful when you are passing this object to native code and native code won't know if GC moved it. Note that using a lot of pinning handles may degrade GC performance (I've got GC team bugging me about pinned string handles in the past - they don't like pinning handles). 

Actually, there are more secret internal handle types that are not exposed. In this post I'll be talking about dependent handle, and why it is totally awesome.

## Caching without leaks

Let's say you want to implement the best cache ever for your customer. Naturally you start with a `Dictionary<Customer, CustomerData>` and start adding things into it. So far so good. Except that all of your customers are now leaking. It's obvious - they are being held by the dictionary! If you are in total control of the lifetime of the `Customer` object (for example, you have a dispose), it's straigh-forward to automatically remove it from cache when it disposes. However, this may not always be possible. Another obvious choice is to resort back to finalizers - adding a finalizer to `Customer` type which removes itself from the cache when it finalizes. It works, but it means you now have potentially lots of objects that are finalizable, and there is only one finalizer thread. There is something called finalizer starvation - meaning finalizer couldn't catch up with the objects that are finalized. Oops.

Now, what if the key is not held alive by the Dictionary, and instead is a `WeakReference<Customer>`? But this doens't really work - you are no longer leaking `WeakReference<Customer>`, but you are still leaking `CustomerData`, and what if `CustomerData` has a reference back to Customer? You are back to square one.

Before we give up, let's try one more thing - let's make both key and value to a `WeakReference<T>`. Now we no longer leak `Customer` nor `CustomerData`. However, the cache doesn't work quite right, some times you'd have null keys, or you have null values.

You can keep trying, but the real problem is that we need two simple things:

* Key and Value should both be alive, or not alive
* If Key is not alive, we should allow key to be collected as if key is held by a weak reference

Now if this were custom data structure, this is easy to implement - just have the key reference the value thorugh a field, and have a WeakReference to the key. Done.

But what if we want a general purpose data structure? You can't exactly add a new field to arbitary T.

## DependentHandle to the rescue

`Dependent handle` is designed to solve this exact problem. Unlike regular handles, a dependent handle has two targets - primary and secondary. It has the same effect as a field reference - GC will scan primary and secondary, and will keep secondary alive if primary is alive.

If you are familiar with GC in a high-level (there aren't many true GC experts out there and I'm not one of them), you'll know that .NET GC scans live objects by *tracing* through object references, starting from roots - that is static variables, thread locals, stack variables, and strong (normal) handles, and going object to object, field by field. Dependent handle are kinda special by itself - GC will scan a list of dependent handle, and will mark secondary (making it alive, surviving this GC) alive if primary is alive.

Note that GC may have to scan the dependent handle list multiple times. If C -> A, A -> D, B -> C, the first scan may skip C -> A but would mark C eventually due to B is alive, then it has to come back and mark C -> A, A -> D, basically marking new objects. So GC will keep scanning the dependent handle list until there are no more new objects being marked (alive). Another reason that GC may need to do this is due to mark stack overflow (when GC ran out of stack space during mark). 

You might think this is not very efficient, and it is not. In theory you could get rid of this multiple scan, because the problem is you don't have all the edge information as you go. This is solvable by essentially traverse the list of dependent handles and builds up a graph - thus avoiding traversing the same node twice as you already have all the edges, similar to the regular object graph traversing case (you'd have all the fields that are your edges). However, because the list of dependent handles, and the objects they point to are dynamic, building up this graph can be expensive, and you would be doing this work pretty much every GC (since the graph could easily change). In practice, a complicated graph between dependent handles are not common, so the trade-off works out in our favor. But this implementation for sure may subject to future change.

If you are curious you can refer to <https://github.com/dotnet/coreclr/blob/release/2.0.0/src/gc/objecthandle.cpp#L1267>

```cpp
// Scan the dependent handle table promoting any secondary object whose associated primary object is promoted.
//
// Multiple scans may be required since (a) secondary promotions made during one scan could cause the primary
// of another handle to be promoted and (b) the GC may not have marked all promoted objects at the time it
// initially calls us.
//
// Returns true if any promotions resulted from this scan.
bool Ref_ScanDependentHandlesForPromotion(DhContext *pDhContext)
{
    LOG((LF_GC, LL_INFO10000, "Checking liveness of referents of dependent handles in generation %u\n", pDhContext->m_iCondemned));
    uint32_t type = HNDTYPE_DEPENDENT;
    uint32_t flags = (pDhContext->m_pScanContext->concurrent) ? HNDGCF_ASYNC : HNDGCF_NORMAL;
    flags |= HNDGCF_EXTRAINFO;

    // Keep a note of whether we promoted anything over the entire scan (not just the last iteration). We need
    // to return this data since under server GC promotions from this table may cause further promotions in
    // tables handled by other threads.
    bool fAnyPromotions = false;

    // Keep rescanning the table while both the following conditions are true:
    //  1) There's at least primary object left that could have been promoted.
    //  2) We performed at least one secondary promotion (which could have caused a primary promotion) on the
    //     last scan.
    // Note that even once we terminate the GC may call us again (because it has caused more objects to be
    // marked as promoted). But we scan in a loop here anyway because it is cheaper for us to loop than the GC
    // (especially on server GC where each external cycle has to be synchronized between GC worker threads).
    do
    {
        // Assume the conditions for re-scanning are both false initially. The scan callback below
        // (PromoteDependentHandle) will set the relevant flag on the first unpromoted primary it sees or
        // secondary promotion it performs.
        pDhContext->m_fUnpromotedPrimaries = false;
        pDhContext->m_fPromoted = false;

        HandleTableMap *walk = &g_HandleTableMap;
        while (walk) 
        {
            for (uint32_t i = 0; i < INITIAL_HANDLE_TABLE_ARRAY_SIZE; i ++)
            {
                if (walk->pBuckets[i] != NULL)
                {
                    HHANDLETABLE hTable = walk->pBuckets[i]->pTable[getSlotNumber(pDhContext->m_pScanContext)];
                    if (hTable)
                    {
                        HndScanHandlesForGC(hTable,
                                            PromoteDependentHandle,
                                            uintptr_t(pDhContext->m_pScanContext),
                                            uintptr_t(pDhContext->m_pfnPromoteFunction),
                                            &type, 1,
                                            pDhContext->m_iCondemned,
                                            pDhContext->m_iMaxGen,
                                            flags );
                    }
                }
            }
            walk = walk->pNext;
        }

        if (pDhContext->m_fPromoted)
            fAnyPromotions = true;

    } while (pDhContext->m_fUnpromotedPrimaries && pDhContext->m_fPromoted);

    return fAnyPromotions;
}
```

## ConditionalWeakTable


For a complete list of handle types, see

<https://github.com/dotnet/coreclr/blob/release/2.0.0/src/gc/gcinterface.h#L241>