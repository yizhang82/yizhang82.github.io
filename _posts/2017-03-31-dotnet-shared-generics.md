---
layout: post
title:  "Sharing .NET generic code under the hood"
date:   2017-03-31
categories:
- C#
- CLR
- netcore
- typesystem
- generics
permalink: dotnet-generics-sharing
comments: true
description: Talks about how .NET achieves sharing generic code
---  

If you come from a C++ programming background, you are most likely already familiar with C++'s template code bloat problem. Each template instantiation gets its own copy of the code (of course, compiler/linker can optimize by throwing away unused methods). The reason being that C++ template are more like C macro on steriods. I know this is a great simplification, but at the end of the day, it is pretty much a code expansion feature with type safety. This grants C++ some powerful capabilities that C# developers don't have - like template specialization, or calling arbitary methods on a template class, or a whole different programming paradigm that's known as template meta-programming. On the other hand, .NET generics require you to define what operations can be perform on T using constraints (otherwise you are limited to a small set of operations such as casts, assignments, etc). However, this does give .NET a unique advantage - it can do a better job at code sharing. 

## Instantiation over value types

First, let's take a look at what it doesn't do. Let's say you have the following code:

```csharp
    public class GenericValue<T>
    {
        T val;

        public void Assign(T t)
        {
            val = t;
        }
    }
```

When you have two instantiations over value types such as `int` and `double`, .NET doesn't share the method body between the two instantiations, because - you guessed it - because they are value types. If you think about how a compiler emits code, you'll see why it can be quite challenging if you want to share the code:
* `int` and `double` has different sizes - 4 and 8 bytes. So a compiler can't simply assign a register or allocate a fixed portion of the stack to hold the value, or make the copy. 
* Depending on the platform, `int` and `double` can be passed in different registers / stack. Compiler doesn't even know where T is when the call has been made. 
* compiler also needs to know where the object fields are in order to track the GC fields. This is obviously not a problem with primitive types, but can become an issue if you are dealing with structs with reference type fields. Without knowing what T is, it doesn't know where the reference type fields are, and it won't be able to mark the fields (See [.NET Garbage Collector Fundamentals](https://msdn.microsoft.com/en-us/library/ee787088(v=vs.110).aspx) for more details. 

To further illustrate my point, this is the assignment in the `int` version:

```
00007FFD73760BAC  mov         rax,qword ptr [rbp+50h]  
00007FFD73760BB0  mov         edx,dword ptr [rbp+58h]  
00007FFD73760BB3  mov         dword ptr [rax],edx
```

And this is the assignment in the `double` version:

```
00007FFD34160C1F  mov         rax,qword ptr [rbp+50h]  
00007FFD34160C23  vmovsd      xmm0,qword ptr [rbp+58h]  
00007FFD34160C29  vmovsd      qword ptr [rax+8],xmm0 
```

Of course, challenging doesn't mean it's impossible. In theory, you could pass those value types as boxed value type, and therefore passing it by-reference. Or change the callsite convention to pass the type along with the struct (and always pass struct by reference). With a bit more code, you could in theory have a version that allocates the right amount of buffer, copy the right size, and know where the fields are (because boxed value types are reference types and the first pointer size field is the type, and from type you can get the fields) when given the right information. However, this would significantly reduce performance with value types, which is why it's not being done today in CLR (.NET Framework) and CoreCLR (.NET Core). However, .NET Native today does support some form of generic sharing for value types under limited cirumstances, but that's out of the scope of our discussion today.

## Instantiation over reference types

The story is very different with reference types. Let's say we have GenericValue<string> and GenericValue<object>.

This is the object version:

```
00007FFD73770CB1  mov         rcx,qword ptr [rbp+50h]  
00007FFD73770CB5  mov         rdx,qword ptr [rbp+60h]  
00007FFD73770CB9  call        00007FFDD2D83DE0  
```

And this is the string version:

```
00007FFD73770CB1  mov         rcx,qword ptr [rbp+50h]  
00007FFD73770CB5  mov         rdx,qword ptr [rbp+60h]  
00007FFD73770CB9  call        00007FFDD2D83DE0  
```

It's easy to see that they are identical. As a matter of fact, they are from the same address - you can see .NET is sharing the method body between two instantiations!

If you think about it, being a reference type makes it very natural to share .NET generic method bodies:

1. All reference type have the same length - a pointer size. Copying/Storing a pointer works the same way no matter what the pointer is.  
2. No matter what the size of the actual object is, a pointer is always passed in the same way - as a pointer (duh!)
3. You can easily tell what fields the reference type have, because reference types have a [MethodTable](https://github.com/dotnet/coreclr/blob/master/src/vm/methodtable.cpp) (CLR's jargon for type) pointer in the first pointer-size field and you can find a lot of information from that MethodTable, including fields. This makes GC happy.

Now, you might ask, what about method calls inside the method body? Are they reallly sharable? 

This is actually an really interesting question. Let's look at a few different cases:

### 1. You are making an non-virtual instance method call or even better, a static method call,  n specific class or a `T` constrained over a class

This is the easier case. Obviously this can only be achieved through class constraints by having T constraining over a class. Any competent JIT implementation will see right through your intention and happily put a direct call to the right method (or even inline it, if it is in a good mood). This is perfect for code sharing. 

(BTW, a direct call in this case is actually a lie. The call would actually jmp to another code that either does the JITting or the real code. But that's a topic for another post)

### 2. You are making an interface call such as IFoo

In .NET code, an interface cast is achieved through a helper call into the CLR called `JIT_ChkCastInterface` - which simply does a check (it doesn't change the value of 'this' pointer, unlike C++). The actual interface call is made through a special piece of code called virtual dispatch stub and gets passed in some additional secret argument telling the stub what exactly the interface method is, and the stub will happily find the right method to call. 

```
00007ffd`3b9005b5 e83692d25e      call    CoreCLR!JIT_ChkCastInterface (00007ffd`9a6297f0)
00007ffd`3b9005ba 488945e8        mov     qword ptr [rbp-18h],rax
00007ffd`3b9005be 488b4de8        mov     rcx,qword ptr [rbp-18h]
00007ffd`3b9005c2 49bb2000793bfd7f0000 mov r11,7FFD3B790020h
00007ffd`3b9005cc 3909            cmp     dword ptr [rcx],ecx
00007ffd`3b9005ce 41ff13          call    qword ptr [r11]
```

Note that there are also cases where JIT can figure out which method it is at JIT time if T is a value type. But that's not really an interesting case for code sharing since it is specifically for that value type instantiation.  

### 3. You are making an virtual method call on specific class or a `T` constrained over a base class

In .NET, virtual functions are dispatched through v-table. This is perhaps not at all surprising if you are a C++ programmer. JIT spits out the following code for a virtual call:

```
00007ffd`3b570582 488b4d20        mov     rcx,qword ptr [rbp+20h]
00007ffd`3b570586 488b4520        mov     rax,qword ptr [rbp+20h]
00007ffd`3b57058a 488b00          mov     rax,qword ptr [rax]
00007ffd`3b57058d 488b4048        mov     rax,qword ptr [rax+48h]
00007ffd`3b570591 ff5020          call    qword ptr [rax+20h] ds:00007ffd`3b3f7190={ConsoleApp7.Foo.Func() (00007ffd`3b5700a0)}
```

Here is a brief explanation of what the code does:

1. First it puts the object pointer at [rbp+0x20] into rcx, which is the `this` pointer and the first argument, preparing for the call. 
2. `this` gets put into rax as well.
3. It retrieves the first pointer-size field. This is the magic `MethodTable` field. Again, you can think of it as the richer version of a C++ v-table. 
4. It adds an magic offset `0x48` and retrieve the function pointer to call.
5. It calls the function pointer which goes to the underlying function body.

As you can see, this is not that different from C++ virtual function call. 

Given that you are either calling a virtual function on `T` that is constrained over a particular class, or on a specific class, the v-table layout is going to be compatible between T and T's derived classes, and therefore they will have the same magic offset 0x48, and therefore needs the same code, allowing code sharing.

### 4. Other calls

There are other interesting scenarios such as calling a generic virtual method. Those scenarios may involve further sharing - the generic virtual method body could be shared themselves. This requires additional runtime magic that I'm not going to cover in this post.  

## What's next

In this post I only touched the basics - how .NET generics is able to achieve code sharing between different reference type instantiations. Of course, it doesn't really stop here - sharing code brings its own set of challenges. One such interesting challenge is: How do you know what `T` is? What is the magic that enables retriving the value of typeof(T)? 

This is something I'll talk about in my next post. 

Thanks for reading!

