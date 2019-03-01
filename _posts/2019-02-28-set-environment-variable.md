---
layout: post
title:  "CoreCLR's environment is not your environment" 
description: CoreCLR maintains its own private copy of environment variables 
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

This came up when I was helping another collegue in a previous job (where I still write C# code probably 50% of the time), diagnosing a library load failure problem inside a linux container. Internally there is this library that loads different implementations (mock implementation and real implementation) of another library based on a environment variable `USE_MAGIC_TEST_LIB`, and the .NET code calling that library is calling `SetEnvironmentVariable` to set it conditionally as part of a testing framework:

```csharp
if (useTestFramework)
{
    Environment.SetEnvironmentVariable("USE_MAGIC_TEST_LIB", "1");
}

NativeCode.CallToSomeNativeLibraryThatLoadsDifferentLibraryDependsOnEnv();

```

This looks reasonable except that it didn't work at all. It loaded the wrong library and things quickly went down hill after that.

We were scratching our heads for a while until we decided to add a trace to see if the environment is actually taking effect or not in the native code. Interestingly, the native code didn't see it at all. It's like they don't know about each other's environment!

Actually that observation is more or less what's going on. Before we dig in a bit deeper, here is a bit of history of CoreCLR cross-platform implementation. Not surprisingly, .NET code started as Windows centric and all the OS calls are strictly Windows API. At some point folks decide to port it to linux/Mac as part of Rotor (later Silverlight), there are two options:
1. Design a new platform abstraction from scratch and move it to that
2. Align the API design to Windows and implement Windows API on top of Linux API

2 is obviously the cheaper solution and has the advantage that Windows code would be untouched and therefore won't get regressions, which is super important. The caveat is that implementing Windows API using Linux API can get tricky, but is the risk people are willing to take. So the new PAL layer is introduced with "new" APIs that looks exactly like Windows APIs implemented using Linux APIs.

In the case of `SetEnvironmentVariable`, it is implemented in PAL/environ.cpp:

```c++
BOOL
PALAPI
SetEnvironmentVariableA(
            IN LPCSTR lpName,
            IN LPCSTR lpValue)
{
    // ...

    // All the conditions are met. Set the variable.
    int iLen = strlen(lpName) + strlen(lpValue) + 2;
    LPSTR string = (LPSTR) PAL_malloc(iLen);
    if (string == nullptr)
    {
        bRet = FALSE;
        ERROR("Unable to allocate memory\n");
        SetLastError(ERROR_NOT_ENOUGH_MEMORY);
        goto done;
    }

    sprintf_s(string, iLen, "%s=%s", lpName, lpValue);
    nResult = EnvironPutenv(string, FALSE) ? 0 : -1;

    PAL_free(string);
    string = nullptr;

    // If EnvironPutenv returns FALSE, it almost certainly failed to allocate memory.
    if (nResult == -1)
    {
        bRet = FALSE;
        ERROR("Unable to allocate memory\n");
        SetLastError(ERROR_NOT_ENOUGH_MEMORY);
        goto done;
    }

```

This looks a bit fishy. It's allocating its own buffer and calls into EnvironPutenv, which basically does this:

```c++
    for (i = 0; palEnvironment[i] != nullptr; i++)
    {
        const char *existingEquals = strchr(palEnvironment[i], '=');
        if (existingEquals - palEnvironment[i] == nameLength)
        {
            if (memcmp(entry, palEnvironment[i], nameLength) == 0)
            {
                free(palEnvironment[i]);
                palEnvironment[i] = copy;

                result = TRUE;
                break;
            }
        }
    }

    if (palEnvironment[i] == nullptr)
    {
        _ASSERTE(i < palEnvironmentCapacity);
        if (i == (palEnvironmentCapacity - 1))
        {
            // We found the first null, but it's the last element in our environment
            // block. We need more space in our environment, so let's double its size.
            int resizeRet = ResizeEnvironment(palEnvironmentCapacity * 2);
            if (resizeRet != TRUE)
            {
                free(copy);
                goto done;
            }
        }

        _ASSERTE(copy != nullptr);
        palEnvironment[i] = copy;
        palEnvironment[i + 1] = nullptr;
        palEnvironmentCount++;

        result = TRUE;
    }
```

So it's basically managing its own memory in `palEnvironment` environment array! No wonder things don't work. 

But why go through all the trouble while Linux has its own `getenv`/`setenv`?

These posts provides the answer:

http://rachelbythebay.com/w/2017/01/30/env/

> Modifications of environment variables are not allowed in multi-threaded programs.
> -- the glibc manual

https://github.com/dotnet/coreclr/issues/635


> From looking at the code, I suspect that the cached environment was attempt to fix thread safety or consistency problems between Environment.GetEnvironmentVariables and Environment.SetEnvironmentVariable.

> The enumeration of the environment starts by reading the [environ](http://linux.die.net/man/5/environ) global variable, without any locks. Consider what may happen if somebody calls setenv while the enumeration is in progress.

It's because `setenv`/`getenv` isn't particularly thread safe - you can crash when reading environment while the environment get modifed by another thread, or two threads modifying environment at the same time can lead to leaks. 

In this case, one can see a few options:

1. Do nothing - the issues are linux-specific and you should take care when calling these functions, the same way just like you call them in linux.
2. Throw PlatformNotSupported - getenv/setenv just isn't safe
3. Adding critical section around getenv/setenv - make them safe to be called in multiple threads
4. Implement your own safe environment helpers - as a result rest of the native library won't observe the change through `getenv`/`setenv`

1 isn't really acceptable because .NET developers need the code to be portable - they don't want handle the platform special oddies to make their code portable. They would like .NET platform library to be safe and reliable. 

2 isn't great either for the same reason, and also it'll break a ton of code when ported to linux. 

3 makes .NET code safe, but it wouldn't protect against native code racing with getenv/setenv calls from within .NET code, so race conditions would still occur and .NET developer has little control. 

4 is safe, but can lead to subtle breaking changes. 

Unfortunately there isn't a great option here. 1, 2, and 4 are safe option, but all of them have their downsides. At the end of the day, it comes down to compatibility/portability vs surprising behavior. .NET team favors compatibility and portability. While it can lead to sutble breaking changes, fortunately the breaking changes are consistent and therefore easier to diagnose. In our case being a container launched by another system makes the whole thing much harder to diagnose, but that's more a problem of the container launcher itself. Even though we were bit by the very same problem, I agree it is most likely the better choice.

For more information, you can refer to CoreCLR code here:

https://github.com/dotnet/coreclr/blob/master/src/pal/src/misc/environ.cpp#L607

And here is a simple code snippet to demonstrate the issue. I've tested this on my MBP. 

```csharp
using System;
using System.Runtime.InteropServices;


namespace set_env
{
    class Program
    {
        [DllImport("/usr/lib/system/libsystem_c.dylib")]
        static extern IntPtr getenv(string name);

        [DllImport("/usr/lib/system/libsystem_c.dylib")]
        static extern int setenv(string name, string value);

         static void Main(string[] args)
        {
            string envName = "MY_ENV";

            Console.WriteLine("MY_ENV={0}", Environment.GetEnvironmentVariable(envName));

            Environment.SetEnvironmentVariable(envName, "~/path");
            Console.WriteLine("Setting it to ~/path");

            Console.WriteLine("MY_ENV={0}", Environment.GetEnvironmentVariable(envName));

            IntPtr env = getenv(envName);
            string envStr = Marshal.PtrToStringAnsi(env);
            Console.WriteLine("getenv(MY_ENV)={0}", envStr);

            Console.WriteLine("Setting it using setenv");
            setenv(envName, "~/path");

            env = getenv(envName);
            envStr = Marshal.PtrToStringAnsi(env);
            Console.WriteLine("getenv(MY_ENV)={0}", envStr);
        }
    }
}
```

Now if you are interested to dig in a bit more, here are some bonus questions:
1. Does the same problem happen in Windows? And why/why not?
2. Why does the above code above use `Marshal.PtrToStringAnsi` instead of just have `getenv` returning the string? 
