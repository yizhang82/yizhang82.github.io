---
layout: post
title:  "Go value semantics"
description: "Value vs pointer"
permalink: go-value-member-
comments: true
excerpt_separator: <!--more-->
categories:
- go 
---

When defining member functions in go, you have the choice of defining them as value or pointers:

```go
func (sql sqlConn) setHost(host string) {}
func (sql *sqlConn) setHost(host string) {}
```

Both are valid. 

In most languages, they have a `this` pointer (or `self`, etc) that references to the current target object the member function is running on, and modifications will "stick" that it'll apply on the current object. 
