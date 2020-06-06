---
layout: post
title:  "Welcome to Linux symbol hell"
description: "Windows has DLL hell, and Linux has symbol hell"
permalink: linux-symbol-hell 
comments: true
excerpt_separator: <!--more-->
categories:
- linux
- os
- opinion
---

# Welcome to Linux Symbol Hell

No Operation System is perfect. I use both Windows and Linux (and MacOS, but that's topic for another day) regularly at work and home, for development, entertainment, etc. I've started with Windows in my work so I know it's quirks inside out, and the Windows DLL hell problem is well known. After switching to a new job I've been mostly using Linux for development, and I've already started seeing some its quirks. One problem that I (and other people in the team) encounter semi-regularly is symbol conflicts. Just for the sake of flashier titles I'm just going to call it "Symbol Hell".  

## Everything is global by default

In linux, all symbols are publicly visible by default.

And making it worse, any statically linked libraries are also exposed publically.


> This is exactly why Windows has DLL hell. Everybody shoves their DLL into system32 thinking their version is the best, while breaking others in major / subtle ways. Global by default is just not a great idea.


## 3 scenarios

1. Both library foo and bar static link lib

2. Both library foo and bar dynamic link lib


## What are my options as a library author?


1. Making all your symbols hidden by default

2. Choose a unique prefix and allow people to change it

3. Avoid global contracts 

This needs a bit of explanation. The simplest example is a global init/cleanup function. Imagine both librari foo and bar they think they own lib and call lib_init and lib_cleanup. Consider this case:
1. foo call lib_init
2. bar call lib_init -> no op
3. bar call lib_cleanup -> oops, this cleans up the data
4. foo calls lib_do_something -> crashes 

There are a couple of ways to address this:
1. Give them ref-counting semantics. This way you'll only cleanup when cleanup is called for the last time
2. Rethink your contract. Having init returning a cookie and having cleanup use that cookie. Or change it to allocation / free pattern as if this is an object. The idea is to change the global state to an object / local state.