# .NET generics sharing under the hood - the typeof(T) problem

If you come from a C++ programming background, you are probably already familiar with C++'s template code bloat problem - each template instantiation gets its own copy of the code (of course, compiler can throw away unused methods). The reason being that C++ template are more like C macro on steriods (I know this is a great simplificiation, but at the end of the day, it is pretty much a code expansion feature with type safety) and every template can do its own thing - this gets C++ some powerful capabilities that C# developers don't have - like template specialization, or calling arbitary methods on a template class, etc. On the other hand, .NET generics require you to define what operations can be perform on T using constraints (otherwise you are limited to a small set of operations such as casts, assignments, etc). However, this does give .NET a unique advantage - it can do a better job at code sharing. 


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

Now if you have two instantiations over int and float, .NET doesn't share the method body between the two instantiations because they are value types. If you think about how a compiler emits code, you'll see why it is challenging:
* int and float has different sizes. So a compiler can't simply assign a register or allocate a fixed portion of the stack to hold the value, or make the copy
* depending on the platform, int and float can be passed in different registers. Therefore, compiler doesn't even know where T is. 
* compiler also needs to know where the object fields are in order to track the GC fields. Without knowing what T is, it doesn't know where the offsets are. 

This is the assignment in the int version:

```
00007FFD73760BAC  mov         rax,qword ptr [rbp+50h]  
00007FFD73760BB0  mov         edx,dword ptr [rbp+58h]  
00007FFD73760BB3  mov         dword ptr [rax],edx
```

And this is the assignment in the float version:

```
00007FFD73760C0F  mov         rax,qword ptr [rbp+50h]  
00007FFD73760C13  vmovss      xmm0,dword ptr [rbp+58h]  
00007FFD73760C19  vmovss      dword ptr [rax],xmm0 
```

Of course, challenging doesn't mean it's impossible. In theory, you could pass those value types as boxed, and therefore passing it by-reference. With a bit more code, you could in theory have a version that allocates the right amount of buffer, copy the right size, and know where the fields are (because boxed value types are reference types and the first pointer size field is the type, and from type you can get the fields). Actually .NET native today supports some form of generic sharing for value types, but that's out of the scope of our discussion today.

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

They are identical. As a matter of fact, they are from the same address, and therefore .NET is sharing the method body between two instantiations!

If you think about it, being a reference type makes it very natural to share .NET generic method bodies:
1. All reference type have the same length - a pointer size. Copying a pointer works the same way no matter what the pointer is.  
2. No matter what the size of the actual object is, a pointer is always passed in the same way - as a pointer (duh!)
3. You can easily tell what fields the reference type have, because reference types have a MethodTable (type) pointer in the first pointer-size field and you can find a lot of information from that MethodTable, including fields, etc. This makes GC happy.

Now, you might ask, what about method calls inside the method body? 

This is an really interesting question.

Let's look at a few different cases:
1. You are making an interface call

This is the easier case. An interface cast is achieved through a helper call `JIT_ChkCastInterface` - which simply does a check (it doesn't change the value of 'this' pointer). The actual interface call is also the same - it goes through a virtual dispatch stub and pass in some secret argument telling the stub what exactly the interface method is, and the stub will happily find the right method to call. 

```
00007ffd`3b9005b5 e83692d25e      call    CoreCLR!JIT_ChkCastInterface (00007ffd`9a6297f0)
00007ffd`3b9005ba 488945e8        mov     qword ptr [rbp-18h],rax
00007ffd`3b9005be 488b4de8        mov     rcx,qword ptr [rbp-18h]
00007ffd`3b9005c2 49bb2000793bfd7f0000 mov r11,7FFD3B790020h
00007ffd`3b9005cc 3909            cmp     dword ptr [rcx],ecx
00007ffd`3b9005ce 41ff13          call    qword ptr [r11]
```

Note that there are also cases where JIT can figure out which method it is at JIT time if T is a value type. But that's not really an interesting case for code sharing since it is specifically for that value type instantiation.  

2. You are making an non-virtual instance method call or even better, a static method call

Obviously this can only be achieved through class constraints by having T constraining over a class. Any competent JIT implementation will see right through your intention and happily put a direct call to the right method. This is great for code sharing since the calling same method calls is perfect for sharing.  


3. You are making an virtual method call

In .NET, virtual functions are dispatched through v-table. This is perhaps not at all surprising if you are a C++ programmer. JIT spits out the following code:

```
00007ffd`3b570582 488b4d20        mov     rcx,qword ptr [rbp+20h]
00007ffd`3b570586 488b4520        mov     rax,qword ptr [rbp+20h]
00007ffd`3b57058a 488b00          mov     rax,qword ptr [rax]
00007ffd`3b57058d 488b4048        mov     rax,qword ptr [rax+48h]
00007ffd`3b570591 ff5020          call    qword ptr [rax+20h] ds:00007ffd`3b3f7190={ConsoleApp7.Foo.Func() (00007ffd`3b5700a0)}
```

1. It puts the object pointer at [rbp+0x20] into rcx, which is the 'this' pointer and the first argument, preparing for the call. 
2. Then it does the same thing into rax as well
3. It retrieves the first pointer-size field. This is the magic MethodTable* field. You can think of it as the richer version of a C++ v-table. 
4. It adds an magic offset 0x48 and retrieve the function pointer to call
5. It finally makes call

This is not that different from C++ virtual function call. 

Given that your T is constrained over a particular class, the v-table layout is going to be compatible between T and T's derived classes, and therefore they will have the same magic offset 0x48, and therefore needs the same code, allowing code sharing.

## What's next

In this post I only touched the basics - how .NET generics is able to achieve code sharing between different reference type instantiations. Of course, it doesn't really stop here - sharing code brings its own set of challenges. The more interesting challenge is: how do you know what T is? For example, what is the magic that enables retriving the value of typeof(T)? I'll talk about it in my next post.

Thanks for reading!

