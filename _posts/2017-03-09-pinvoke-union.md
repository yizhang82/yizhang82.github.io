---
layout: post
title:  "P/invoke with unions in C#"
date:   2017-03-09
categories:
- C#
- interop
permalink: pinvoke-union
comments: true
description: Talks about things to watch out for when using unions in C#
---

When interop with native code using C# p/invokes, some time you need to create unions in C#. They are represented by structs with `[StructLayout(LayoutKind.Explicit)]` attribute and the fields annotated with `[FieldOffset(0)]` specifying their offset. It looks pretty straight-forward, but in practice this can be very deceiving. In this article, I'll talk about two important rules when using unions. 

# No overlapping fields of reference fields and value type fields

```csharp
[StructLayout(LayoutKind.Explicit)]
struct Foo
{
    [FieldOffset(0)]
    string a;

    [FieldOffset(0)]
    int b;
}
```

This one doesn't look that bad on surface - you have a string at offset 0, and it could also be a int at 0. It can't be much different with a C struct with char * and a int union, right? 

Not really. Given that this is .NET, all the objects / reference types are managed by the GC. Imagine if you are GC and you need to determine whether there is a string object at Foo.a needs to be kept alive (marked) - there is a value 0x12345678 at that location. What do you do? 
1. Pretend that it is a object reference and go access it
2. Admit defeat, ignore it, and assume it's a int

As you can see, there really isn't a good option here. There is no way you can tell an arbitary integer and a object reference apart. 

Fortunately, CLR Typeloader will quickly point out that this is invalid:

```
Unhandled Exception: System.TypeLoadException: Could not load type 'Foo' from assembly 'union, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null' because it contains an object field at offset 0 that is incorrectly aligned or overlapped by a non-object field.
```

A slight variant of this is overlapping fields:

```csharp
[StructLayout(LayoutKind.Explicit)]
struct Foo
{
    [FieldOffset(0)]
    string a;

    [FieldOffset(1)]
    string b;
}
```

Now you got a string reference at offset 0, and a string reference at offset 1. Again, if you are reading an pointer value (really, that's what object reference is) out of offset 0, is it string a, or a 3/4 of string b? Don't know. Again, type loader would blow up and give you the same exception.

# Overlapping C# union fields must be blittable

This one is slightly more subtle, but not that bad once you understand how .NET interop marshalling works. 

First let me clarify what blittable means - it means the native and managed representation is the same. Obviously any reference type is not blittable. Char is also not blittable by default since char is UTF-16 in managed, and UTF-8/ANSI in native (according to CLR marshalling rules - otherwise it can be whatever you want). Simple integer types are blittable. The reason it is named blittable, means that we can simply copy the bits (blit) over and the result is guarantee to be correct by definition, without marshaling/copying field by field.

Let's look at this example:

```csharp
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Explicit)]
struct Foo
{
    [FieldOffset(0)]
    public int a;

    [FieldOffset(0)]
    public char b;
}

struct NativeFoo
{
    public int a;
}

class Program
{
    static unsafe void Main(string[] args)
    {
        NativeFoo nativeFoo = new NativeFoo();
        nativeFoo.a = 0x12345678;
        Foo managedFoo = new Foo();

        managedFoo = Marshal.PtrToStructure<Foo>(new IntPtr(&nativeFoo)); 
        Console.WriteLine("{0:x}", managedFoo.a);
    }
}

```

The union in this case is a Foo struct with a int field and char field. We are calling `Marshal.PtrToStructure<Foo>` to convert the equivalent structure NativeFoo with a int field `0x12345678` to Foo. Can you guess what the result is?

This is what I get on my MBP:

```
yizhang@yzha-mbp:~/var/union$ dotnet run
12340078
```

Now reverse the two fields:

```csharp
[StructLayout(LayoutKind.Explicit)]
struct Foo2
{
    [FieldOffset(0)]
    public char a;

    [FieldOffset(0)]
    public int b;
}
```

This is what I got:

```
yizhang@yzha-mbp:~/var/union$ dotnet run
12345678
```

You might wonder: wait a minute, the two Foo are clearly the same thing, and the result should also be the same. Layout-wise, yes. But from CLR interop marshalling point of view, they are quite different. Before we discuss further, I need to bring your attention to the char field. It is a 2-byte UTF-16 char in C#, but by default it is a 1-byte char when we marshal it. When CLR marshals structs, the fields are marshaled one-by-one (duh!). This usually works as expected without surprise, but with overlapping fields that requires additional marshalling, it means the contents of the struct depends on the order of fields! 

Let's look at the two structs again:
1. Foo - CLR converts integer a first, writes 0x12345678 to the buffer where the struct is located. In intel machines, where least significant byte shows up first, the memory layout is `0x78, 0x56, 0x34, 0x12`. CLR then converts the char. The 1-byte char is 0x78 at offset 0. Converting that to a UTF-16 char meaning writing 0x0078, which is `0x78, 0x00` to offset 0. Now the memory content becomes: `0x78, 0x00, 0x34, 0x12`. Reversing that to get the integer - `0x12340078`!
2. Foo2 - CLR converts char first, 1-byte 0x78 becomes 0x0078 and therefore 0x78, 0x00. The memory is now `0x78, 0x00, 0x??, 0x??` (0x?? means garbage uninitialized bytes). Then CLR writes the entire int 0x12345678 to the buffer, erasing all the work it did in the first field. Now the buffer is the integer value `0x12345678`.

In short, if you have overlapping fields that requires marshalling, the contents of the field are determined by their order!

Languages like C doesn't have this problem because they take the union as-is without any conversion, and it is entirely up to the programmer to interpret the value (C++ is perhaps a different story if you try to have unions with C++ class fields with copy constructors and then copy them around...). This is obviously a more hands-off approach, but it works usually as expected when the programmer clearly knows what he/she wants. Unfortunately, C# has no idea what your intention is. One way that this can be improved is to error out if there are overlapping fields requiring marshalling. Unfortunately it is too late to change that now without potentially breaking people accidentally taking dependency on the ordering. Another potential approach is to have a selector construct that allows you to specify which portion of the struct is valid - a good example is perhaps VARIANT. However, the complexity is perhaps not worth it.

If you think unions are too complicated, just stick to simple blittable unions - it'll make your life much easier. 
