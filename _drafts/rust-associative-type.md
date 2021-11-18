---
layout: post
title:  "Associative type on Rust is not needed"
description: ""
permalink: thoughts-on-rust 
comments: true
excerpt_separator: <!--more-->
categories:
- rust
---

Since I started learning Rust I've really enjoyed many aspects of the language - it got many things right, such as ownership / life time / enums / error handling / etc. But there is one thing that I think is not necessary in the language, and that is associative types.

```
trait Graph {
    type N;
    type E;
    fn has_edge(&self, &N, &N) -> bool;
}
```

A associative is a type that leave some sub types unspecified and will be specfied later.

To me, this is just syntax sugar for generic traits. I don't really agree with the benefits described in the RFC. I think this feature can be simply replaced with the following code:

```
trait Graph<N, E> {
    type Node = N;
    type Edge = E;
    fn has_edge(&self, &N, &N) -> bool;
}
```

* Readability and scalability

> Associated types make it possible to abstract over a whole family of types at once, without having to separately name each of them. This improves the readability of generic code (like the distance function above). It also makes generics more "scalable": traits can incorporate additional associated types without imposing an extra burden on clients that don't care about those types.

* Ease of refactoring/evolution

> Because users of a trait do not have to separately parameterize over its associated types, new associated types can be added without breaking all existing client code.

This is not true. If you are adding a new type that is disassociated with any other type, you don't need to add any new type parameter.

https://github.com/rust-lang/rfcs/blob/master/text/0195-associated-items.md


When I'm browsing the web for people talking about the 