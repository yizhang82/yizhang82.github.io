---
layout: post
title:  "When SetEnvironmentVariable doesn't set environment variable"
description: How to version your structs the right way
permalink: set-environment-variable
comments: true
excerpt_separator: <!--more-->
categories:
- dotnet
- dotnetcore
- version
- api
- design
---

# 

This came up when I was helping another collegue diagnosing a library load failure problem inside a linux container. Internally there is this library that loads different implementations (mock implementation and real implementation) of another library based on a environment variable `USE_MAGIC_TEST_LIB`, and the .NET code calling that library is calling `SetEnvironmentVariable` to set it conditionally as part of a testing framework:

```csharp

```