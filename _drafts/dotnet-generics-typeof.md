
# typeof(Secret)

In [last post](http://yizhang82.me/dotnet-generics-sharing) we've talked about how .NET does code sharing for reference types. This time let's take a look at how `typeof(T)` does its black magic. In particular, how does the code knows what `typeof(T)` is, in the presence of code sharing? 

Obviously if there is no code sharing at all, each method instantiation are different and the code would be instantiated with the correct `typeof(T)` code where T is a real type, it obviously would "just work".

Before we dive into the implementation, let's take a first crack at this problem and see what are the challenges.

<!-- more -->

## Interview Challenge: Implement typeof(T) for CLR / .NET

Let's consider the following code:

```cs

class Foo
{
    void Func<T>(T obj) { Console.WriteLine(typeof(T)); }
}

```

One obvious idea is to just get T from the argument:

```cs

void Func<T>(T obj) { Console.WriteLine(obj.GetType()); }

```

This appears to work, but if you think about it, it doesn't always give the right answer. What if obj is a sub-class and T is a base class? In this case we end up printing the derived class, which is incorrect. 

And T doesn't always show up in the arguments as well:

```cs
class Foo
{
    void Func<T>() { Console.WriteLine(typeof(T)); }
}
```

Let's take a look at another case:

```cs
class Foo<T>
{
    void Func() { Console.WriteLine(typeof(T)); }
}
```

This time, there is no argument that helps us. But we do have this pointer - which is `Foo<T>`:


```cs
class Foo<T>
{
    void Func<T>() { Console.WriteLine(this.GetType().GetGenericArguments()[0]; }
}
```

This actually works rather well. But what if this is a static method which doesn't have this?

```cs
class Foo<T>
{
    static void Func() { Console.WriteLine(typeof(T)); }
}
```

So looks like we can't really always rely on the argument/this pointer inside the function to figure out the T type (except for instance methods on generic types where we can use `this` pointer).

To make those cases work, you need to think like a runtime/compiler dev - if there isn't enough information in the method itself, change the caller to pass it in! Just imagine the compiler (JIT, or .NET native) could work with the runtime to figure out these are special methods that needs "assistance", and needs to change the call site (fancy term for where the call happens in the caller code) to insert a magic parameter that carries additional information about the type arguments. .NET JIT/Runtime often employs tricks like this which is called "secret argument" (spoiler alert for futher posts: interop IL stubs also does it - due to the same reason thta is code sharing).

## Under the hood

Internally, .NET runtime supports 3 kinds of generic lookup:

1. Look up generic argument from `this`
2. Look up generic argument from secret `InstantiatedMethodDesc` parameter
3. Look up generic argument from secret `MethodTable` parameter

These are defined in corinfo.h:


```cpp

enum CORINFO_RUNTIME_LOOKUP_KIND
{
    CORINFO_LOOKUP_THISOBJ,
    CORINFO_LOOKUP_METHODPARAM,
    CORINFO_LOOKUP_CLASSPARAM,
};

```

During compilation, compiler works with runtime to figure out information about the method being called in `CEEInfo::getCallInfo`, which calls `CEEInfo::ComputeRuntimeLookupForSharedGenericToken` to determine the lookup kind.

```

## Diving into the generated code - CORINFO_LOOKUP_THISOBJ

Assuming we have the following code:

```cs

    // Case #1: Generic class, non-generic method
    class T1<T>
    {
        public void Func()
        {
            Console.WriteLine(typeof(T));
        }
    }

    // Case #2: Non-generic class, generic method
    class T2
    {
        public void Func<T>()
        {
            Console.WriteLine(typeof(T));
        }
    }

    // Case #3 : Generic class, static non-generic method
    class T3<T>
    {
        public static void Func()
        {
            Console.WriteLine(typeof(T));
        }
    }

    // Case #4: Non class, static generic method
    class T4<T>
    {
        public static void Func()
        {
            Console.WriteLine(typeof(T));
        }
    }

```

Let's take look at case #1 first. As discussed earlier, the type parameter is infered from `this` pointer:

```asm

00007fff`04ff0946 488b4d10        mov     rcx,qword ptr [rbp+10h]           ; this pointer
00007fff`04ff094a 488b09          mov     rcx,qword ptr [rcx]               ; MethodTable *
00007fff`04ff094d 488b4930        mov     rcx,qword ptr [rcx+30h]           ; m_pPerInstInfo
00007fff`04ff0951 488b09          mov     rcx,qword ptr [rcx]               ; first generic dictionary
00007fff`04ff0954 488b09          mov     rcx,qword ptr [rcx]               ; first type arg
00007fff`04ff0957 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff095b 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff095e f7c101000000    test    ecx,1                             ; does it have indirection?
00007fff`04ff0964 750a            jne     00007fff`04ff0970
00007fff`04ff0966 488b4de0        mov     rcx,qword ptr [rbp-20h]           ; no indirection required - load T
00007fff`04ff096a 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff096e eb0f            jmp     00007fff`04ff097f
00007fff`04ff0970 488b4de0        mov     rcx,qword ptr [rbp-20h]           ; has indirection - go get that
00007fff`04ff0974 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff097b 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff097f 488b4dd8        mov     rcx,qword ptr [rbp-28h]           ; either way rbp-28h is the type we need
00007fff`04ff0983 e868dfac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)    ; Get Type object

```

I've added code comments above. But in order to understand it - we need to talk about another concept - generic dictionaries.

You might have realized this in the beginning of this article - if we use `this` pointer to get the type argument, we need a way to say "give me the T argument". The runtime supports this operation using a special data structure called generic dictionary in `MethodTable` (which is CLR's equivalent of a Type in the runtime). It saves each type argument for each generic parameter, and also caches associated instantiations (we won't talk about it here - otherwise this will get too long). It is in `m_pPerInstInfo` field which happens to be at 0x30:

```

0:000> dt coreclr!MethodTable
   =00007fff`64ec6808 s_pMethodDataCache : (null) 
   =00007fff`64ebe154 s_fUseParentMethodData : Int4B
   =00007fff`64ebe158 s_fUseMethodDataCache : Int4B
   +0x000 m_dwFlags        : Uint4B
   +0x004 m_BaseSize       : Uint4B
   +0x008 m_wFlags2        : Uint2B
   +0x00a m_wToken         : Uint2B
   +0x00c m_wNumVirtuals   : Uint2B
   +0x00e m_wNumInterfaces : Uint2B
   +0x010 m_pParentMethodTable : Uint8B
   +0x018 m_pLoaderModule  : Ptr64 Module
   +0x020 m_pWriteableData : Ptr64 MethodTableWriteableData
   +0x028 m_pEEClass       : Ptr64 EEClass
   +0x028 m_pCanonMT       : Uint8B
   +0x030 m_pPerInstInfo   : Ptr64 Ptr64 Dictionary

```

Recall that `MethodTable` is always at the first pointer field in any object - this is how you can do `object.GetType`. Anyway, you need to jump through a few hoops to get to `m_pPerInstInfo`:

```

00007fff`04ff0946 488b4d10        mov     rcx,qword ptr [rbp+10h]           ; this pointer
00007fff`04ff094a 488b09          mov     rcx,qword ptr [rcx]               ; MethodTable *
00007fff`04ff094d 488b4930        mov     rcx,qword ptr [rcx+30h]           ; m_pPerInstInfo

```

Due to inheritance, an object could have more than one generic dictionaries and can refer to base / parent class's generic dictionary. In this case there is only one. The first element in the dictionary is the first type argument, the 2nd one is the 2nd type argument, etc. In this case we just get the first one:

```

00007fff`04ff0951 488b09          mov     rcx,qword ptr [rcx]               ; first generic dictionary
00007fff`04ff0954 488b09          mov     rcx,qword ptr [rcx]               ; first type arg

```

After that we need to do a bit of fixup if the pointer is a pointer to the actual type `MethodTable`. The lowest bit being 1 indicates that it is an indirection, otherwise it is the real pointer. Either way, the real type arguments ends up being `rcx` which we call `coreclr!JIT_GetRuntimeType` on, which gives you the type. 

## Diving into generated code - CORINFO_LOOKUP_METHODPARAM

This time let's look at T2 - a generic instance method on a non-generic class.

The call site pass a secret argument:

```asm

00007fff`04ff050a 48ba8061e904ff7f0000 mov rdx,7FFF04E96180h        ; This is the SECRET ARGUMENT
00007fff`04ff0514 3909            cmp     dword ptr [rcx],ecx
00007fff`04ff0516 e8bdfbffff      call    00007fff`04ff00d8

```

The secret argument is actually a `InstantiatedMethodDesc` which has a `m_pPerInstInfo` field at 0x10 pointing to generic dictionary, just like `MethodTable`. Since there is no inheritance, there is only one generic dictionary.

I've added some comment to the method code. It is very similar and a bit more straight-forward (less indirections). 

```asm

                                                                            ; rdx is saved in [rbp+18h] earlier
00007fff`04ff2010 488b4d18        mov     rcx,qword ptr [rbp+18h]           ; rdx - SECRET ARGUMENT -> InstantiatedMethodDesc *
00007fff`04ff2014 488b4910        mov     rcx,qword ptr [rcx+10h]           ; m_pPerInstInfo
00007fff`04ff2018 488b09          mov     rcx,qword ptr [rcx]               ; first type argument
00007fff`04ff201b 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff201f 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff2022 f7c101000000    test    ecx,1                             ; indirection check
00007fff`04ff2028 750a            jne     00007fff`04ff2034
00007fff`04ff202a 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff202e 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff2032 eb0f            jmp     00007fff`04ff2043
00007fff`04ff2034 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff2038 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff203f 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff2043 488b4dd8        mov     rcx,qword ptr [rbp-28h]           ; either way it's in rbp-28h
00007fff`04ff2047 e8a4c8ac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)

```

## Diving into generated code - CORINFO_LOOKUP_CLASSPARAM

In case #3, the type parameter is in the class. So naturally we pass the type / MethodTable * as the secret argument:

```
00007fff`04ff051c 48b95863e904ff7f0000 mov rcx,7FFF04E96358h            ; this is the secret argument
00007fff`04ff0526 e8e5fbffff      call    00007fff`04ff0110
00007fff`04ff052b 90              nop

```

The secret argument is not surprisingly T3 (edited for clarity):

```

0:000> !dumpmt 7FFF04E96358
Name:               TypeOfTest.T3[System.String, System.Private.CoreLib]

```

The code looks almost exactly the same as the `this` case - except in that case we need to get the `MethodTable` from `this` instead from secret argument:

```asm

00007fff`04ff227c 488b4d10        mov     rcx,qword ptr [rbp+10h]       ; SECRET ARGUMENT - the MethodTable
00007fff`04ff2280 488b4930        mov     rcx,qword ptr [rcx+30h]       ; m_pPerInstInfo
00007fff`04ff2284 488b09          mov     rcx,qword ptr [rcx]           ; first dict
00007fff`04ff2287 488b09          mov     rcx,qword ptr [rcx]           ; type argument
00007fff`04ff228a 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff228e 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff2291 f7c101000000    test    ecx,1
00007fff`04ff2297 750a            jne     00007fff`04ff22a3
00007fff`04ff2299 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff229d 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff22a1 eb0f            jmp     00007fff`04ff22b2
00007fff`04ff22a3 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff22a7 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff22ae 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff22b2 488b4dd8        mov     rcx,qword ptr [rbp-28h]
00007fff`04ff22b6 e835c6ac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)

```

## Conclusion

We've looked at how CLR does its typeof(T) magic through a combination of looking at this pointer and secret arguments. Techniques like these are pretty effective and there honestly aren't a lot of options if you want to share the code. And in order to share the code, there are additional cost involves when doing seemingly simple things like typeof(T) - nothing is free. In next post we'll dig a bit deeper into generic dictionaries and other dark secrets with secret argument passing. 

Two interesting questions that you can probably think about:

* How do you make this work with secret type arguments and also make it performant?

```cs

class Foo<T>
{
    public void Func() { Console.WriteLine(List<IComparable<T>>); }
}

```

* How do you make secret argument work with delegates?
