---
layout: post
title:  "Best practice when versioning structs"
description: How to version your structs the right way
permalink: version-structs
comments: true
excerpt_separator: <!--more-->
categories:
- version
- api
- design
---

When designing C APIs, one important aspect is to how to version the C structs. We were discussing versioning within the team and this topic came up. So I thought I should probably document the best practices.

Let's say you have an API that takes a C struct:

```c
struct super_accurate_time
{
    int year;
    int month;
    int day;
}

void super_accurate_time(super_accurate_time *time);
```

And user should call it like this:

```c
super_accurate_time time;
get_time(&super_accurate_time);
```

So far so good.

Now imagine your API is shipped in a shared dynamic library (DLL, so, dylib, etc), and now you've shipped a new version of your API and added 3 fields hour/minute/second, since there are customers out there that cares about those things :)

```c
struct super_accurate_time
{
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
}
```

Now all of your customer existing code would blow up when running against your new shiny dynamic library, because your code would start writing hour/minute/second into user code, who still have the old definition of `super_accurate_time`! So hour/minute/second goes beyond super_accurate_time and into other data - users are effectively attacking themselves with buffer overruns (more or less). 

An effective way to guard against such issue is to add a size field:

```c

struct super_accurate_time
{
    size_t size;
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
}

Caller needs to initialize the `super_accurate_time` struct with the size:

```c

super_accurate_time time;
time.size = sizeof(time);
get_time(&super_accurate_time);

```

You'll see quite a bit of code like this when working with Windows APIs - they are there for this exact reason. Once you have the size, you can implement get_time and fill-in the correct contents as needed:

```c

void get_time(super_accurate_time *time)
{
    if (time->size >= SUPER_ACCURATE_TIME_V1)
    {
        time->year = get_year();
        time->month = get_month();
        time->day = get_day();
    }

    if (time->size >= SUPER_ACCURATE_TIME_V2)
    {
        time->hour = get_hour();
        time->minute = get_minute();
        time->second = get_second();
    }
}

```

This way existing code still works as you would see the size being `SUPER_ACCURATE_TIME_V1` and only assign the old fields in v1. And newer code would assign both v1 fields and v2 fields.

Of course, there is still the problem of calculating `SUPER_ACCURATE_TIME_V1`, `SUPER_ACCURATE_TIME_V2`, etc. You could always calculate them manually but the size can be architecture-dependent, and calcuating the size is also error-prone. Why not let the compiler do it for us?

```c

struct super_accurate_time_v1
{
    size_t size;
    int year;
    int month;
    int day;
}

struct super_accurate_time_v2
{
    size_t size;
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
}

void get_time(super_accurate_time *time)
{
    if (time->size >= sizeof(super_accurate_time_v1))
    {
        time->year = get_year();
        time->month = get_month();
        time->day = get_day();
    }

    if (time->size >= sizeof(super_accurate_time_v2))
    {
        time->hour = get_hour();
        time->minute = get_minute();
        time->second = get_second();
    }
}

```

As you can see, by pasting different versions of struct and name it as _v1, _v2, etc, you'll get a few benefits:

* Compiler does the size calculation for you - manually calculating the size yourself is always tricky (padding, architecture, etc)

* It's easy to see the history - all the histories are there in the code.

