---
layout: post
title:  "Writing your own C++ coroutines: getting started"
date:   2017-10-05
categories:
- C++
- coroutines
- async
- await
- future
- promise
permalink: cpp-coroutines-basic-concepts
comments: true
description: Discuss high-level concepts when 
---  

I've been spending some time looking at how to wrap some of our existing C API that is based on completion callbacks, with C++ coroutines. I just got it working tonight and I thought I'd document what I've learned in this process and hopefully help other folks. My focus is the stackless coroutine / resumable functions proposed by Gor Nishanov et al and it is supported by Microsoft VC++ and Clang. I won't be talking about boost::coroutine. I also won't be talking about how to *use* coroutines - this is about how to write your own light-weight coroutine plumbing for library authors.

## Getting started

To get started, I'd recommend start with the following coroutine talks on CppCon, in this order:

[CppCon 2014: Gor Nishanov "await 2.0: Stackless Resumable Functions"](https://www.youtube.com/watch?v=KUhSjfSbINE)

This one is a nice overview of C++ coroutines.

[CppCon 2016: James McNellis “Introduction to C++ Coroutines"](https://www.youtube.com/watch?v=ZTqHjjm86Bw)

Not really a introduction for understanding coroutines. But for writing your own coroutines.

[CppCon 2016: Gor Nishanov “C++ Coroutines: Under the covers"](https://www.youtube.com/watch?v=8C8NnE1Dg4A)

Talks about how the compiler does its codegen magic.

[CppCon 2016: CppCon 2016: Kenny Kerr & James McNellis “Putting Coroutines to Work with the Windows Runtime"](https://www.youtube.com/watch?v=v0SjumbIips)

This one is admittingly an odd choice. Even though it talks about wrapping WinRT APIs (which few people cares about), I found it super relevent to my own goals since WinRT async is completion callback based. There are also many nice tricks there useful in practice (such as how to resume on a diffrent thread, etc).

## Digging into the standard

Now that you have some sense of the basics, it'd be good to know where are the reference materials. It's time to dig into the standard:

* [N4628 - coroutine extensions to C++ standard](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2016/n4628.pdf)
* [N4402 - resumable functions](https://isocpp.org/files/papers/N4402.pdf)

There are a lot of stuff here. Don't worry - you can use them as a reference and for background, just scan through to get a basic idea/context - there is no need to get into the nitty gritty details for now.

## Basic concepts

Whew. That's a lot of material to go through. Before we really dig into the details, I think it'd be good to go over some basic concepts first. I personally find that understanding these concepts are very helpful: 

* coroutine - a function that has one of the coroutine operators - co_await/co_yield/co_return, and return a coroutine object (such as future<T>, task<T>, assuming that they are coroutine compatible). 

* coroutine frame - compiler allocated context information to store various coroutine implementation details. Most importantly, all local variables and function arguments are located/captured in this object. It must be allocated on the heap in order to preserve those local variables when suspend/resume happens. This is the definition of a stack-less coroutine.

* awaitable type - a type that implements await_suspend/await_ready/await_resume. any function that returns this type can be co_await-ed. It doesn't necessarily mean it is a coroutine - it just means that it can participate / collaborate with other coroutines. As a matter of fact, when you are wrapping C APIs that uses completion callbacks, it is not necessary to make those wraper function to be coroutines - since they don't use co_await themselves. We'll discuss this more in a upcoming post.

* suspension/resume - suspension means stopping execution of the current coroutine and let the async operation happen in background. In the context of stackless coroutines, it is often implemented as returning to the parent, all the way up, until it returns back to the main event loop (for a UI thread), a blocking wait on the coroutine completion, or end of the thread and return the thread back to thread pool. resume on the other hand, means that compiler will call the code after the point of suspension (that is, after the co_await) when signaled the async work is done.

* coroutine_handle - compiler helper type that represents a coroutine suspension point (where the co_await is). It is used to resume after the suspension point (after the co_await), and it also is associated with the promise.

* coroutine promise - this is the main type that has various integration points (initial_suspend, final_suspend, get_return_object, return_value) to the coroutine itself. The scope is the entire coroutine. We'll discuss this in more detail in an upcoming post. 

* coroutine object - a type returned by a coroutine. In VC++, this is usually a future<T> (VC++ compiler folks have made changes to make future<t> a coroutine object).  

* coroutine_traits - allows associating an existing type with a promise type, making it a coroutine type to the eyes of the compiler. For example, you can write coroutine_traits to make standard future<T> a coroutine object, or make boost::future a coroutine object as well. 

## What's next

OK. I think this is it for now. I'm planning to write a few follow-up posts on C++ coroutines:
* Diving deeper into compiler codegen for coroutine and co_await operator on a awaitable type where all these types/concepts ties together. Only when you understand compiler generated code you'll truly be able to effectively write your own coroutine implementation. This is a bit unfortunate due to the complexity of C++ coroutines.
* Writing your own coroutine-supported future and promise. Shouldn't be too bad once we understand compiler codegen.
* Wrapping your C API with completion callback. It's actually quite straight-forward once you get this far. 

Hope this helps.
