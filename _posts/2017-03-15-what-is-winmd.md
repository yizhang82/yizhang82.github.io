---
layout: post
title:  "Windows Runtime is not a Runtime"
date:   2017-03-15
categories:
- winrt
- interop
permalink: what-is-winrt
comments: true
description: Clarifies what is Windows Runtime and why it is not a Runtime
---   

I've spent a non-trival part of my career adding Windows Runtime support to .NET framework and .NET native, and I often get people asking me what is Windows Runtime and there is a lot of confusion around it. The bad naming certainly doesn't help in this case. I'm going to write a series blog post so that I can point people to. :)

# Windows Runtime, or WinRT?

They are interchange-able. Don't mistake it for Windows RT - it has nothing to do with Windows Runtime/WinRT, and it's a horrible name. I'm going to use WinRT for the rest of the article, for the sake of brevity.  

# OK. What exactly is WinRT?

First of all, let's talk about what WinRT is *not*. 

# WinRT is *not* a runtime

A runtime is a collection of helper libraries that provide support for a platform or a language. WinRT, on the other hand, fundamentally, is an ABI (Application Binary Interface). It provides a set of binary-level (read: in terms of machine instructions, memory layout, etc, as oppposed to source code level) common protocols that describes how components can talk to each other, including:
1. How to make calls
2. How to pass data structure
3. What is the set of primitive types
4. What is a structure/object

In Windows 8+, where WinRT is supported, the entire WinRT ecosystem consists of the following:
1. The OS (Windows, XBOX, phone)  provides a hierarchy of object-oriented APIs that expose OS functionality, following WinRT ABI, typically implemented in C++ (not C++/CX). These APIs are often called WinRT APIs because they are available in Windows and is usually the only WinRT types you care about. But WinRT API is not WinRT itself - it is simply a collection of types/methods that follows WinRT ABI. You could implement your own WinRT APIs, for example. 
2. Visual Studio provides a set of compilers/languages, such as C#, VB.NET, JS, C++/CX, C++, that understands the ABI so that they can interact with the new set of APIs that is based on WinRT.
3. Applications, written using one or more of those languages, and running as UWP (Universal Windows Apps) or [Desktop Bridge](https://developer.microsoft.com/en-us/windows/bridges/desktop) (sandboxed desktop apps). 
4. 3rd party libraries and controls.

# WinRT is strongly-typed COM

If you start to think the description above awfully looks like COM, it's because it is. COM components follow a basic set of rules:
1. Object expose a set of interfaces
2. Interface calls are made through v-table
3. Object lifetime is controled by ref-counts
4. Interface all derive from `IUnknown` (except `IUnknown` itself)

And WinRT objects follow all of them. The most basic interface in WinRT is called `IInspectable`. The reason it is called `IInspectable` is because it allows you to "inspect" the object by asking the question "what are you". If you are familiar with COM, you might recall that COM objects doesn't have a strong identity - they are a collection of interfaces, but themselves are not typed. On the other hand, WinRT *is* strongly typed, thanks for `IInspectable::GetRuntimeClassName`, which returns the type name of the object. There are also other functions in `IInspectable`, but they are less relevant to this discussion. 

# What do I do with name of the object

Typically, the name is used to locate the actual type. This enables the compiler/runtime to know what is the set of interfaces available to them at runtime. For example, if `IInspectable::GetRuntimeClassName` tells you it's a `Windows.UI.Xaml.Controll.Button`, then you know it supports interfaces/operations in this class. This helps compiler decide at runtime whether a cast to `Button` should succeed, and when you look at it in the debugger, you'll also see that it's a Button. 

# What about compile time? And what exactly is a WinMD?

At compile time, all the types are described in .WinMD files (short for Windows metadata). WinMD files are essentially .NET PE files without code (well, actually that's not always true, but I'll write a separate post on that later). You can open .winmd files in `ildasm` or `ILSpy` - they'll happily decode them as .NET PE files. There are interesting additions to .NET PE file to represent special information for WinRT objects, including, well, the fact that they are WinRT types through the magic `WindowsRuntime` flag. For example, this is the ildasm output for Button:

```
.class public auto ansi windowsruntime Windows.UI.Xaml.Controls.Button
       extends Windows.UI.Xaml.Controls.Primitives.ButtonBase
       implements Windows.UI.Xaml.Controls.IButton,
                  Windows.UI.Xaml.Controls.IButtonWithFlyout
{
```

Did I mention there is no code in them? Let's take a look at get_Flyout:

```
.method public hidebysig newslot specialname virtual final 
        instance class Windows.UI.Xaml.Controls.Primitives.FlyoutBase 
        get_Flyout() runtime managed
{
  .override Windows.UI.Xaml.Controls.IButtonWithFlyout::get_Flyout
} // end of method Button::get_Flyout
```

Where did the code go? Given that these APIs are Windows APIs, they naturally are implemented by Windows OS, typically in C/C++ code (implemented in a ATL-ish framework called WRL). The method here simply provides enough information for compilers and runtimes to figure out what the function look like, and correctly make calls to them following WinRT/COM ABI.

Compilers, such as C#, are in a good position to understand WinMD files since they already understand .NET PE file / metadata format. If you are curious about what metadata format looks like, the best source of information is [ECMA 335](http://www.ecma-international.org/publications/standards/Ecma-335.htm). On the other hand, other languages such as C++ would have to use [`IMetadataImport`](https://msdn.microsoft.com/en-us/library/ms230172(v=vs.110).aspx), [`CCI`](http://ccimetadata.codeplex.com/), [`System.Reflection.Metadata`](https://github.com/dotnet/corefx/tree/master/src/System.Reflection.Metadata) to read WinMDs. 

# What does WinRT have but COM doesn't?

* Strongly-typed objects. I've already discussed it above. This is great for scripts.
* A common format that describes types/methods. This is the WinMD file we discussed earlier. 
* A common set of collection interfaces (such as IVector, IIterable, etc)
* A new way of activating WinRT objects as well as supporting object inheritance.
* Concept of boxing - passing arbitary value type as objects. Similar to .NET boxing.
* New way to hook up events using delegates. WinRT delegates are represented as .NET delegate in WinMD file, but their native counterpart is simply a `IUnknown`-derived interface. 
* A few new marker interfaces and attributes that attach special COM threading behavior to WinRT objects
* Ability to resolve ref-count cycles using .NET GC (this is limited to between XAML and .NET, at the moment)
* Data binding through reflection or reflection-like mechanisms

Note that many of the capabilities above are often provided using well known WinRT APIs. But they are typically considered a core part of WinRT ABI that it is usually considered part of WinRT itself. Just like how you would consider IList part of core .NET even though it is just an API. 

Of course, this is by no means a exhaustive list. I've simply choosen to highlight a few that I think is important.

# How do you call a WinRT method?

For C++ code, calling these functions are very straight-forward - just make a v-table call to the underlying method using a predetermined offset (if it is the 3rd method, then it is offset 2 * pointer_size). It might be easier to explain in terms of C, if you are not familiar with COM:

```c
struct IFoo_Vtbl 
{
    void *pFoo;
}

IFoo *p = GetFoo();
IFoo_Vtbl **ppVtbl = p;
IFoo_Vtbl *pVtbl = *ppVtbl;     // first pointer-value pointed by p is the v-table pointer
((foo_func_ptr)(pVtbl->pFoo))(arg1, arg2, ...);
```


In C#, there are a lot more involved. .NET / CLR is responsible for generating stubs that calls from managed code into native code, flippping a few internal states, converting managed data structure to native data structures (such as strings, etc), convert native WinRT objects into RCWs (Runtime Callable Wrapper), and managed objects into CCWs back to native. If you are familiar with .NET COM interop, you'll immediately recognize that RCWs/CCWs are used in COM interop. Here in WinRT they serve exactly the same purpose - as proxies that can be consumed by the other side. This is another evidence that WinRT is built on top of COM. 

# Can my favorite language X (insert your favorite language here) support WinRT

There is nothing prevents those languages to support WinRT if it is able to make v-table calls and pass C-compatible data structures. If it already supports COM, it is in a pretty good place to build WinRT support on top of it. Projection, on the other hand, needs to be looked at depending on the usage pattern for each language. This is the topic for one of future articles. 

# What's next?

More articles to come. Here is a rough list of what I had in mind:
* What is WinRT projection and how it is implemented in .NET
* What is a managed WinRT component (also known as managed WinMD)
* WinRT and .NET Native
