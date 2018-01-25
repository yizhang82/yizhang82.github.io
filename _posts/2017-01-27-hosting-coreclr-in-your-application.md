---
layout: post
title:  "Embedding CoreCLR in your C/C++ application"
date:   2017-01-27
description: Hosting CoreCLR in your C/C++ application
permalink: hosting-coreclr
comments: true
categories:
- clr
- interop
- hosting
- dotnet
---  
CoreCLR is the runtime that runs your .NET Core application, just like the 'classic' .NET in your machine, except it's much smaller and requires no installation. This makes it ideal for embedding .NET code as part of your application without additional dependency, and you completely are in control of the version of CoreCLR that you are running. 

In order to include CoreCLR in your application, you need to "embed" (in CoreCLR terms, this is called hosting) CoreCLR by loading and initializing the runtime instance, and start running code. CoreCLR exposes such functionality through C APIs defined in [coreclrhost.h](https://github.com/dotnet/coreclr/blob/master/src/coreclr/hosts/inc/coreclrhost.h). This post shows you how to do that. 

The discussion below applies to MacOS, but equally applies to Windows/Linux as well. 

# How to initialize CoreCLR and call managed code from C++

Obviously, you need to actually load the runtime DLL. 

```c
    void *coreclr = dlopen("libcoreclr.dylib", RTLD_NOW | RTLD_LOCAL);
```

Once you have coreclr loaded, you need to initialize coreclr by calling ```coreclr_initialize``` function. First step to that is to retrieve the function pointer:

```c
    coreclr_initialize_ptr coreclr_init = reinterpret_cast<coreclr_initialize_ptr>(dlsym(coreclr, "coreclr_initialize"));
```

Before calling the function, it is important to set the properties to tell CoreCLR where to find the platform assemblies, and the path to locate app assembly:

```c
     string tpa_list;
    AddFilesFromDirectoryToTpaList(exe_path, tpa_list);

    const char *property_keys[] = {
        "APP_PATHS",
        "TRUSTED_PLATFORM_ASSEMBLIES"
    };
    
    const char *property_values[] = {
        // APP_PATHS
        app_path,
        // TRUSTED_PLATFORM_ASSEMBLIES
        tpa_list.c_str()
    };
```

The AddFilesFromDirectoryToTpaList is directly borrowed from [coreruncommon.cpp](https://github.com/dotnet/coreclr/blob/master/src/coreclr/hosts/unixcoreruncommon/coreruncommon.cpp). It simply reads the supplied directory for dll/ni.dll using the correct order, and add everything to the list. Having ```TRUST_PLATFORM_ASSEMBLIES``` is needed so that CoreCLR knows where the framework assemblies are. With .NET Core CLI, it is typically located in /usr/local/share/dotnet, but you can have your own copy. One thing to worth out for is that all the path (app_path, tpa_list, etc) here needs to be absolute path - this required for better security. You can easily create absolute path using realpath call.   

Once you set the properties, you can now finally initialize coreclr:

```c
    int ret = coreclr_init(
        app_path,                               // exePath
        "host",                                 // appDomainFriendlyName
        sizeof(property_values)/sizeof(char *), // propertyCount
        property_keys,                          // propertyKeys
        property_values,                        // propertyValues
        &coreclr_handle,                        // hostHandle
        &domain_id                              // domainId
        );                                       
```

Many of the parameters are self-explanatory. The API returns a handle (essentially a pointer) to the CoreCLR runtime instance, which you can use to pass to future CoreCLR related calls.

Now that you have the handle, you can now created a delegate from a static method in a managed assembly. Assuming you want to call this function:


```csharp
using System;

public class ManLib
{
    public static string Bootstrap()
    {
        return "Bootstrap!";
    }
}
```      

You need to first define native function pointer type that corresponds to the native equivalent signature of the managed function:

```c
typedef char *(*bootstrap_ptr)();  
```

Note that String became char *, according to the default C# marshaling rules. You can also customize the marshaling as needed using [MarshalAsAttribute].

With the function pointer type defined, now you can create the managed delegate and marshal it back to the native function pointer type:

```c
    bootstrap_ptr dele;
    ret = coreclr_create_dele(
        coreclr_handle,
        domain_id,
        "manlib",
        "ManLib",
        "Bootstrap",
        reinterpret_cast<void **>(&dele)
        );       
```

The calling part is easy:

```c
    char *msg = dele();
    cout << "ManLib::Bootstrap() returned " << msg << endl;    
    free(msg);      // returned string need to be free-ed   
```

The only part worth mention is that C# returned string needs to be freed. This is part of the contract between C# and native code that any memory ownership transfer needs to be freed using free (in Windows, it should be CoTaskMemFree). Otherwise you'll create a leak. 

# Running the code

First, you'll need to compile the code using g++. You can find the code [here] (https://gist.github.com/yizhang82/1c7c8c9c31a345b1841e64a57856f690). Also, make sure you set include path that has a copy of [coreclrhost.h](https://github.com/dotnet/coreclr/blob/master/src/coreclr/hosts/inc/coreclrhost.h).

Once you have that, use your .NET Core CLI (dotnet) to create a new .NET core project, change the output to a DLL named manlib.dll, put the C# code shown earlier there, and compile that into manlib.dll. Copy that to the directory where host.cpp is. 

Now that you have everything, run the host you compiled earlier, and point it to your dotnet package directory that contains coreclr and all the shared libraries, typically at /usr/local/share/dotnet/shared/Microsoft.NETCore.App/1.0.1, for example:

```./host /usr/local/share/dotnet/shared/Microsoft.NETCore.App/1.0.1```

If everything works as expected, you should see:

```
pp_path:/Users/yizhang/git/personal/blogs/clr/hosting-coreclr/src
Loading CoreCLR...
coreclr_path:/usr/local/share/dotnet/shared/Microsoft.NETCore.App/1.0.1/libcoreclr.dylib
Initializing CoreCLR...
Creating delegate...
Calling ManLib::Bootstrap() through delegate...
ManLib::Bootstrap() returned Bootstrap!
```

Imagine that you can build an application having its own copy of coreclr and libraries, and run managed code this way. You can also extend this to be a self-contained COM component as well, if that's your thing.   

# More information

If you are curious to find out more details, you can take a look at how the test host is implemented in CoreCLR:

https://github.com/dotnet/coreclr/blob/master/src/coreclr/hosts/corerun/corerun.cpp

This is not the host used in .NET Core / CLI, but it provides excellent insight into how one writes a host. The version I presented here is a simplified minimum version. 

If you are running into issues with this sample, you might want to check out CoreCLR doc on [how to debug](https://github.com/dotnet/coreclr/blob/master/Documentation/building/debugging-instructions.md).

Good luck!
