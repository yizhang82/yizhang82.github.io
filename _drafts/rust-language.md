---
layout: post
title:  "My thoughts on Rust"
description: ""
permalink: thoughts-on-rust 
comments: true
excerpt_separator: <!--more-->
categories:
- rust
---

Recently due 

## Pit of success

## Strong lifetime / ownership guarantee

## Thread safety

## Explicit error handling

## Enum is well designed

* Enum and value

In many other languages, enum are just, enums. Often times, enum are often associated with different kinds of values. This is perhaps a good example in some pesudo language (Java/C#-ish):

```
enum Type {
    Integer,
    Float,
    String
}

struct Value {
    Type type;
    int int_value;
    float float_value;
    string string_value;
}
```

It is obvious that you can only use int_value if type = Integer, and so on. However compiler will not enforce this for you - it's up to the programmer to enforce this rules, usually with wrapper functions.

In Rust, you can associate values with enums:

```rust
enum Value {
    Integer(int_value, u32),
    Float(float_value, f32),
    String(string_value, String),
}
```

This is a much better way to represent such associations. Also see the NULL section. Internally, the enum is only big enough for the biggest field, so you are not wasting memory. So it is like a union in many other languages like C/C++.

```
enum Result<T, E> {
    Ok(T),
    Err(E)
}
```

```
enum Option<T> {
    None,
    Some(T)
}
```

Now all these work is for naught if you can access the field directly disregarding the enum - the good news is Rust doesn't let you do that and you can only access it through patterns to "extract" the values. It is a a little bit cumbersome but a good price to pay for safety.

* Converting integer to enum

* Match behavior

## There are no NULL values

Call it NULL / Nothing / Nil / nullptr / None / what-have-you. Most language have one of these. The upside is it is very easy to represent something that can be an valid object or none, but the obvious downside is whether NULL is a possible value is not part of the type, so it is easy to make incorrect assumptions or simply forget to check for such possibilities when needed. Many languages have things like `std::option<T>` to make this more explicit, but it still doesn't change the fact that such contract specifications are missing from the language. 

In Rust, there is no null. The only way to present a value that can be Null is through `std::Option<T>`. This makes the contract much more explicit - if you see an object/reference, it can't be null. 

```
enum Option<T> {
    None,
    Some(T)
}
```

## Move by default

## Rust is very "functional"

## Great compiler errors


## No Garbage Collector

## Too low level

## Not good for prototyping



