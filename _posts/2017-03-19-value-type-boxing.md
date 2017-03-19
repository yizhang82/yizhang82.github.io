---
layout: post
title:  "C# value type boxing under the hood"
date:   2017-03-19
categories:
- C#
- boxing
- typesystem
permalink: value-type-boxing
comments: true
description: Talks about different situation when value type boxing happens and how to avoid it
--- 
I recently had some really interesting discussion with a .NET typesystem expert in the team, and during the conversation he had pointed out an interesting aspect of .NET value type boxing when using constraints. Intrigued by that discussion, I decided to take a further look.

## The basics

Before we dig into the details, let's review some basics and see how boxing can come into play when calling value type methods.

Suppose we have the following code:

```csharp
interface IAdd
{
    void Add(int val);
}

struct Foo : IAdd
{
    public int value;

    void IAdd.Add(int val)
    {
        value += val;
    }

    public void AddValue(int val)
    {
        value += val;
    }

    public void Print(string msg)
    {
        Console.WriteLine(msg + ":" + value);
    }
}
```

Nothing fancy here. Foo is a struct that has a `value` integer field. It privately implements an interface method that attempts to mutates it's value, as well as a regular method that does the same thing.

Now if we have the following code:

```csharp
        Foo f = new Foo();
        f.value = 10;
        
        f.AddValue(10);
        f.Print("After calling AddValue");

        ((IAdd) f).Add(10);
        f.Print("After calling IAdd.Add");
```

What is the correct value after AddValue call and the Add call?

```
Initial Value:10
After calling AddValue:20
After calling IAdd.Add:20
```

If you are familiar with the language, this is perhaps not surprising to you at all.

But let's dig a bit deeper and see how JIT does it:

Let's take a look at the AddValue call first.

```
lea     rcx,[rbp-18h]
mov     edx,0Ah
call    00007ff8`cfa700e0
```

Note that I'm showing x64 assembly code, which is much easier to understand. The first 4 arguments are always passed in register `rcx`, `edx`, `r8`, `r9` (rest is passed through stack), and return value is returned in `rax`. All these are 64-bit wide registers. In the code above, JIT is passing the 'this' pointer in rcx (pointing to portion of the stack starting at `rbp-18h`, and the integer 10 (0x0a) in `rdx/edx` (`edx` is simply the lower 32-bit portion of `rax`). 

Now if you look at the actual code Foo.AddValue:

```
00:000> !u 00007ff8`cfa70670
Normal JIT generated code
Foo.AddValue(Int32)
Begin 00007ff8cfa70670, size 36
>>> 00007ff8`cfa70670 55              push    rbp
sub     rsp,20h
lea     rbp,[rsp+20h]
mov     qword ptr [rbp+10h],rcx        ; this pointer getting saved
mov     dword ptr [rbp+18h],edx        ; this is integer 10
mov rax,7FF8CF964560h
cmp     dword ptr [rax],0
je      00007ff8`cfa70695
call    clr!JIT_DbgIsJustMyCode (00007ff9`2f534eb0)
nop
mov     eax,dword ptr [rbp+18h]        ; integer 10
mov     rdx,qword ptr [rbp+10h]        ; this pointer getting restored
add     dword ptr [rdx],eax            ; assigning first 4-byte at 'this' with 10
nop
lea     rsp,[rbp]
pop     rbp
ret
```

Feel free to ignore some of the debugging gibberish (`clr!JIT_DbgIsJustMyCode`). If you follow my comments in the assembly (starting with `;`), you can see `10` is being added to the first 4-byte memory location at 'this', which is exactly what `value += val` is supposed to do.

And you get the following:

```
Initial Value:10
After calling AddValue:20
```

## Interface call into the value type instance method

Now, let's take a look at the interface call - the interface call gets a bit more complicated:

```
mov rcx,7FF8CF965BB0h                        ; first arg to allocation routine - the Foo struct type
call    clr!JIT_TrialAllocSFastMP_InlineGetThread ; this is the allocation
mov     qword ptr [rbp-20h],rax                   ; rax is the created boxed 'Foo' struct
mov     ecx,dword ptr [rbp-18h]                   ; foo.value
mov     rdx,qword ptr [rbp-20h]                   ; boxed foo
mov     dword ptr [rdx+8],ecx                     ; copy foo to boxed foo
mov     rcx,qword ptr [rbp-20h]
mov     qword ptr [rbp-28h],rcx
mov     rcx,qword ptr [rbp-28h]                   ; rcx points to the new boxed 'Foo' struct on the heap
mov     edx,0Ah                                   ; = 10
mov r11,7FF8CF970020h                        ; r11 is the target 
cmp     dword ptr [rcx],ecx                       ; this does the 'null' check and triggers a NullRefernceException if needed
call    qword ptr [r11]                           ; interface dispatch code
```

Again, I've put comments on the right side of the assembly code. It basically creates a boxed Foo, copy the value to the newly created boxed Foo, . Note the `8` offset is for the `MethodTable` pointer in the beginning of the object - only objects and boxed value type (which is an object, naturally) has those. A regular value type doesn't. 

Ignor all the interface dispatch code for now (it's not relevant to our discussion), eventually you'll arrive at some interesting instructions below:

```
add     rcx,8                          ; skip the MethodTable pointer and to the first field
mov rax,7FF8CF965B78h             
mov     rax,qword ptr [rax]            ; retrieve Foo.Add method
jmp     rax
```

This code doesn't really do much. But actually gives us a lot of insight on how the system works together. Looking back at the old code we've shown earlier for `AddValue` method, it basically expects this pointer to point to the first field. However, all objects, in order to support type operations (such as reflection, casting, etc) has their first pointer-size field as the type pointer, which is called MethodTable in CLR jargon. Therefore, CLR needs to generate *unboxing stub* that unbox the boxed value and calls the underlying JITted method that expects to work with an unboxed `this` pointer. Note that the unboxing doesn't involve a copy, it simply adds an offset to it. This effectively means that the += operation would take effect on the boxed copy. However, since the boxed Foo is only known to the compiler, the newly updated value is forever lost. And that's why you would see:

```
After calling IAdd.Add:20
```

## A case with generics

Now let's add some generics in the mix:

```csharp
    static void Add_WithoutConstraints<T>(ref T foo, int val)
    {
        ((IAdd)foo).Add(val);
    }
    
    Add_WithoutConstraints<Foo>(ref f, 10);
    f.Print("After Add_WithoutConstrats");
```

Even though it is a fancy generic method, the call itself and the underlying code is nothing surprising. As you might already expect, even though the caller passes Foo by reference, `Add_WithoutConstraint` makes a copy of it before it calls into IAdd, and the modification is again, forever lost.

```
After Add_WithoutConstrats:20
```

## Adding constraints

Now the interesting case that I'd like to talk about earlier in the article (thanks for staying with me so far!). Let's create a generic method with a generic constraint where the T is an IAdd interface:

```csharp
    static void Add_WithConstraints<T>(ref T foo, int val) where T : IAdd
    {
        foo.Add(val);
    }

    Add_WithConstraints<Foo>(ref f, 10);
    f.Print("After Add_WithConstraints");
```

Perhaps it isn't entirely obvious to everyone - foo.Add(val) is an interface call using callvirt instruction: `callvirt   instance void IAdd::Add(int32)`, because that's the only way compiler knows how to make the call. 

The interesting part is, when we call Add_WithConstraints, the call happens exactly in the same manner, except the code we are calling into looks drastically different:

```
0:000> !u 00007ff8`cfa707d0
Normal JIT generated code
Program.Add_WithConstraints[[Foo, value]](Foo ByRef, Int32)
Begin 00007ff8cfa707d0, size 3a
>>> push    rbp
sub     rsp,20h
lea     rbp,[rsp+20h]
mov     qword ptr [rbp+10h],rcx           ; this pointer
mov     dword ptr [rbp+18h],edx           ; val
mov rax,7FF8CF964560h                     ; debugger gibberish 
                                          ; but you probably guessed it's for Just My Code
cmp     dword ptr [rax],0
je      00007ff8`cfa707f5
call    clr!JIT_DbgIsJustMyCode (00007ff9`2f534eb0)
nop
mov     rcx,qword ptr [rbp+10h]                  ; this pointer
mov     edx,dword ptr [rbp+18h]                  ; val
call    00007ff8`cfa706c0 (Foo.IAdd.Add(Int32)   ; calls the method without boxing!
nop
nop
lea     rsp,[rbp]
pop     rbp
ret
```

As you can see, the code is surprisingly simple. No boxing, no interface cast, and a direct call to `Foo.IAdd.Add` method. No value is lost. And you can observe the side effect: 

```
After Add_WithConstraints:30
```

The reason is compiler now has enough information to figure out the code is for Foo and the interface call will land exactly on `Foo.IAdd.Add`, so it skips the formality and calls the function directly. This is both a performance optimization but also comes with observable side-effect.  

## Conclusion

When you are working with interface on value types, be aware of the potential performance cost of boxing and correctness problem of not observing changes in the callee. If you'd like to avoid that, you can use generic constraints to constraint the interface call so that compiler can optimize out the boxing and interface call altogether and go straight to the right function.

You can find the full code in this [gist](https://gist.github.com/yizhang82/f449cfef5cc92ed089bd759cfd2debcd).
